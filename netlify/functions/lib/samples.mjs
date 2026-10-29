// Sample programs shown on a brand-new site. Admins can delete or edit them.
// They are only written to storage once, the first time the library is read.
const T = "2026-01-01T00:00:00.000Z";
const sample = (id, subject, experimentNumber, title, language, description, code) => ({
  id, subject, experimentNumber, title, language,
  description: `Sample: ${description}`,
  code: code.trim() + "\n",
  createdAt: T, updatedAt: T,
});

export const SAMPLE_PROGRAMS = [
  sample("sample-ds-1", "Data Structures", 1, "Stack using an array", "c",
    "Push, pop and display on a fixed-size stack.",
    String.raw`
#include <stdio.h>
#define MAX 5

int stack[MAX];
int top = -1;

void push(int value) {
    if (top == MAX - 1) {
        printf("Stack overflow\n");
        return;
    }
    stack[++top] = value;
}

int pop(void) {
    if (top == -1) {
        printf("Stack underflow\n");
        return -1;
    }
    return stack[top--];
}

int main(void) {
    push(10);
    push(20);
    push(30);
    printf("Popped: %d\n", pop());
    printf("Popped: %d\n", pop());
    return 0;
}
`),
  sample("sample-py-1", "Python Programming", 1, "Binary search", "python",
    "Search a sorted list in O(log n) steps.",
    String.raw`
def binary_search(items, target):
    low, high = 0, len(items) - 1
    while low <= high:
        mid = (low + high) // 2
        if items[mid] == target:
            return mid
        if items[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1


numbers = [3, 8, 15, 23, 42, 57, 91]
print("Index of 23:", binary_search(numbers, 23))
print("Index of 10:", binary_search(numbers, 10))
`),
  sample("sample-db-1", "Database Management", 1, "Create tables and join them", "sql",
    "Two related tables and an INNER JOIN.",
    String.raw`
-- Students and the department each one belongs to
CREATE TABLE department (
    dept_id   INT PRIMARY KEY,
    dept_name VARCHAR(50) NOT NULL
);

CREATE TABLE student (
    roll_no INT PRIMARY KEY,
    name    VARCHAR(80) NOT NULL,
    dept_id INT,
    FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

INSERT INTO department VALUES (1, 'Computer Science'), (2, 'Electronics');
INSERT INTO student VALUES (101, 'Asha', 1), (102, 'Ravi', 2);

SELECT s.roll_no, s.name, d.dept_name
FROM student s
INNER JOIN department d ON s.dept_id = d.dept_id
ORDER BY s.roll_no;
`),
  sample("sample-oop-1", "Object-Oriented Programming", 1, "Inheritance and method overriding", "java",
    "A Dog class that extends Animal and overrides speak().",
    String.raw`
class Animal {
    void speak() {
        System.out.println("The animal makes a sound");
    }
}

class Dog extends Animal {
    @Override
    void speak() {
        System.out.println("The dog barks");
    }
}

public class Main {
    public static void main(String[] args) {
        Animal pet = new Dog();
        pet.speak();
    }
}
`),
  sample("sample-mad-1", "Mobile App Development", 1, "Counter app", "dart",
    "A Flutter screen with a button that increments a counter.",
    String.raw`
import 'package:flutter/material.dart';

void main() => runApp(const CounterApp());

class CounterApp extends StatefulWidget {
  const CounterApp({super.key});

  @override
  State<CounterApp> createState() => _CounterAppState();
}

class _CounterAppState extends State<CounterApp> {
  int _count = 0;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('Counter')),
        body: Center(child: Text('Count: $_count')),
        floatingActionButton: FloatingActionButton(
          onPressed: () => setState(() => _count++),
          child: const Icon(Icons.add),
        ),
      ),
    );
  }
}
`),
  sample("sample-web-1", "Web Technologies", 1, "Form validation", "html",
    "Check that a name and an email are filled in before submitting.",
    String.raw`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Form validation</title>
</head>
<body>
  <form id="signup">
    <input id="name" placeholder="Name">
    <input id="email" placeholder="Email">
    <button type="submit">Register</button>
    <p id="message"></p>
  </form>

  <script>
    document.getElementById("signup").addEventListener("submit", function (event) {
      event.preventDefault();
      var name = document.getElementById("name").value.trim();
      var email = document.getElementById("email").value.trim();
      var message = document.getElementById("message");
      if (name === "" || email.indexOf("@") === -1) {
        message.textContent = "Enter a name and a valid email.";
      } else {
        message.textContent = "Welcome, " + name + "!";
      }
    });
  </script>
</body>
</html>
`),
];
