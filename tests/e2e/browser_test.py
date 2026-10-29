# Optional browser test. Needs: pip install playwright && playwright install chromium
# 1) node tests/e2e/dev-server.mjs   (in-memory store, NOT Netlify Blobs; password: e2e-password)
# 2) python3 tests/e2e/browser_test.py
from playwright.sync_api import sync_playwright, expect
import json, sys, os, tempfile
T=tempfile.mkdtemp()
open(T+"/up.py","w").write('def hello():\n    return "uploaded"\n')
open(T+"/bad.py","wb").write(b"binary\x00\x01data")
open(T+"/bad.exe","w").write("x")
open(T+"/big.py","w").write("a"*(500*1024+10))
B="http://localhost:8888"; results=[]
def check(name, cond):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ")+name)
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(permissions=["clipboard-read","clipboard-write"], accept_downloads=True)
    page=ctx.new_page(); errors=[]
    page.on("console", lambda m: errors.append(m.text) if m.type=="error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(B); page.wait_for_selector(".exp")
    check("public list shows 6 samples", page.locator(".exp").count()==6)
    page.fill("#search","binary"); check("search by title", page.locator(".exp").count()==1)
    page.fill("#search","sql"); check("search by language", page.locator(".exp").count()==1)
    page.fill("#search","database"); check("search by subject", page.locator(".exp").count()==1)
    page.fill("#search","zzzz"); check("no-results state", page.locator("#list-pane .state h2").inner_text()=="Nothing matches")
    page.click("text=Clear search and filters"); check("clear restores list", page.locator(".exp").count()==6)
    page.select_option("#subject","Web Technologies"); check("subject filter", page.locator(".exp").count()==1)
    page.select_option("#subject",""); page.select_option("#language","python"); check("language filter", page.locator(".exp").count()==1)
    page.select_option("#language","")
    page.click(".exp >> nth=0"); page.wait_for_selector(".viewer")
    check("viewer opens, hash link set", "#/p/" in page.url)
    check("line numbers render", page.locator(".gutter").inner_text().startswith("1\n2"))
    page.click("text=Copy code"); page.wait_for_selector(".copy-status.ok")
    clip=page.evaluate("navigator.clipboard.readText()")
    check("copy puts full code on clipboard", clip.startswith("#include") and "stack[top--]" in clip)
    with page.expect_download() as d: page.click("text=Download file")
    check("download filename uses .c extension", d.value.suggested_filename.endswith(".c"))
    url=page.url; p2=ctx.new_page(); p2.goto(url); p2.wait_for_selector(".viewer h2")
    check("direct link opens the experiment", "Stack using an array" in p2.locator(".viewer h2").inner_text()); p2.close()
    page.goto(B+"/#/p/doesnotexist"); page.wait_for_selector(".state")
    check("unknown link shows not-found state", "Program not found" in page.content())
    # mobile
    m=br.new_context(viewport={"width":375,"height":700}).new_page(); m.goto(B); m.wait_for_selector(".exp")
    check("mobile: viewer hidden until selection", not m.locator("#viewer-pane").is_visible())
    m.click(".exp >> nth=0"); m.wait_for_selector(".viewer")
    check("mobile: list hidden, back link visible", (not m.locator("#list-pane").is_visible()) and m.locator(".back-link").is_visible())
    check("mobile: no horizontal page scroll", m.evaluate("document.documentElement.scrollWidth<=window.innerWidth"))
    m.click(".back-link"); m.wait_for_selector(".exp")
    # theme
    page.goto(B); page.click("#theme-toggle"); check("theme toggles + persists", page.evaluate("document.documentElement.dataset.theme")=="dark")
    page.reload(); check("theme persisted after reload", page.evaluate("document.documentElement.dataset.theme")=="dark")

    # admin
    a=ctx.new_page(); a.on("console", lambda m: errors.append(m.text) if m.type=="error" else None); a.goto(B+"/admin"); a.wait_for_selector("#login-view:not([hidden])")
    a.fill("#password","wrong"); a.click("#login-btn"); a.wait_for_selector("#login-notice:not([hidden])")
    check("wrong password message", "Incorrect" in a.inner_text("#login-notice"))
    a.fill("#password","e2e-password"); a.click("#login-btn"); a.wait_for_selector("#admin-view:not([hidden])")
    check("login succeeds", True)
    check("password not in storage/DOM", "e2e-password" not in a.content() and "e2e-password" not in str(a.evaluate("JSON.stringify(sessionStorage)")))
    a.click("#save-btn"); a.wait_for_selector("#e-title:not([hidden])")
    check("empty form shows field errors", "required" in a.inner_text("#e-code"))
    # XSS + paste
    a.fill("#f-subject","Security Lab"); a.fill("#f-experimentNumber","1"); a.fill("#f-title","<img src=x onerror=window.__x=1>")
    a.select_option("#f-language","html"); a.fill("#f-code","<script>window.__y=1</script>\n<b>hi</b>"); a.click("#save-btn")
    a.wait_for_selector("#form-notice.ok:not([hidden])"); check("paste + save works", "Added" in a.inner_text("#form-notice"))
    # duplicate
    a.fill("#f-subject","security lab"); a.fill("#f-experimentNumber","1"); a.fill("#f-title","Dup"); a.select_option("#f-language","text"); a.fill("#f-code","x"); a.click("#save-btn")
    a.wait_for_selector("#form-notice.error:not([hidden])"); check("duplicate number blocked with message", "already" in a.inner_text("#form-notice"))
    a.click("#cancel-edit") if a.locator("#cancel-edit").is_visible() else None
    # upload tests
    a.set_input_files("#f-file",T+"/bad.exe"); a.wait_for_selector("#e-file:not([hidden])"); check("unsupported extension rejected", "not supported" in a.inner_text("#e-file"))
    a.set_input_files("#f-file",T+"/bad.py"); a.wait_for_selector("#e-file:not([hidden])"); check("binary content rejected", "plain-text" in a.inner_text("#e-file"))
    a.set_input_files("#f-file",T+"/big.py"); a.wait_for_selector("#e-file:not([hidden])"); check("oversized file rejected", "limit" in a.inner_text("#e-file"))
    a.fill("#f-subject","Python Programming"); a.fill("#f-experimentNumber","2"); a.fill("#f-title","")
    a.select_option("#f-language",""); a.fill("#f-code","")
    a.set_input_files("#f-file",T+"/up.py")
    expect(a.locator("#f-code")).to_have_value(__import__("re").compile("uploaded"))
    check("upload shows content in textarea and picks language", a.input_value("#f-language")=="python" and a.input_value("#f-title")=="up")
    a.fill("#f-code", a.input_value("#f-code")+"# edited before save\n"); a.click("#save-btn")
    a.wait_for_selector("#form-notice.ok:not([hidden])"); check("uploaded + edited program saved", "Added" in a.inner_text("#form-notice"))
    # edit
    a.locator(".admin-row", has_text="up").get_by_text("Edit").click(); a.fill("#f-title","Uploaded program"); a.click("#save-btn")
    expect(a.locator("#form-notice")).to_contain_text("Saved changes"); check("edit saves", True)
    # persistence + other visitor
    v=br.new_context().new_page(); v.goto(B); v.wait_for_selector(".exp"); 
    check("other visitor sees new programs", v.locator(".exp").count()==8)
    v.fill("#search","security"); v.click(".exp"); v.wait_for_selector(".viewer")
    check("XSS title/code rendered as text, not executed", v.evaluate("window.__x===undefined && window.__y===undefined") and v.locator(".viewer h2").inner_text().startswith("<img"))
    check("no injected elements in viewer", v.locator(".viewer img, .viewer script, .viewer b").count()==0)
    v.reload(); v.wait_for_selector(".viewer"); check("persists after refresh", "<img" in v.locator(".viewer h2").inner_text())
    # delete with confirmation
    a.locator(".admin-row", has_text="Uploaded program").get_by_text("Delete").click(); a.wait_for_selector("dialog[open]")
    a.click("dialog button[value=cancel]"); check("cancel keeps program", a.locator(".admin-row", has_text="Uploaded program").count()==1)
    a.locator(".admin-row", has_text="Uploaded program").get_by_text("Delete").click(); a.click("dialog button[value=delete]")
    expect(a.locator("#form-notice")).to_contain_text("Deleted"); check("delete after confirmation", a.locator(".admin-row", has_text="Uploaded program").count()==0)
    # invalid session
    a.evaluate("sessionStorage.setItem('lcl-admin-token','bad.token')"); a.reload(); a.wait_for_selector("#login-view:not([hidden])")
    check("invalid stored session sends admin back to login", "expired" in a.inner_text("#login-notice"))
    a.fill("#password","e2e-password"); a.click("#login-btn"); a.wait_for_selector("#admin-view:not([hidden])")
    a.route("**/api/programs/*", lambda r: r.continue_(headers={**r.request.headers, "authorization": "Bearer bad.token"}))
    a.locator(".admin-row").first.get_by_text("Delete").click(); a.click("dialog button[value=delete]")
    a.wait_for_selector("#login-view:not([hidden])"); check("mutation with bad token is bounced to login", True)
    a.fill("#password","e2e-password"); a.click("#login-btn"); a.wait_for_selector("#admin-view:not([hidden])")
    a.click("#logout"); a.wait_for_selector("#login-view:not([hidden])"); check("sign out works", True)
    errors=[e for e in errors if "Failed to load resource" not in e]; check("no JS errors or CSP violations (expected 4xx responses ignored)", not errors)
    if errors: print(errors)
    br.close()
bad=[n for n,ok in results if not ok]; print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
