# 🚀 GenAI-Driven API Automation Framework (TypeScript + BDD)

## 📌 Overview

This project is a **Proof of Concept (POC)** for a **generic, reusable, and application-agnostic API automation framework** built using **TypeScript** with **BDD (Behavior-Driven Development)**.

The framework enables:

* Business users to write test scenarios in **plain English (Gherkin)**
* AI to convert scenarios into **executable API tests**
* Automatic **reuse of existing steps** (no duplication)
* Execution across **multiple applications** using configuration

---

## 🎯 Problem Statement

Traditional API testing:

* Requires technical knowledge
* Uses tools like Postman (manual, repetitive)
* Is hard for business stakeholders to understand

---

## 💡 Solution

This framework introduces:

* **BDD (Given / When / Then)** for readability
* **GenAI-based parsing** of scenarios
* **Reusable step definitions (no duplication)**
* **Application-agnostic execution**

---

## 🧠 Key Features

### ✅ 1. BDD-Based Test Definition (Business Friendly)

Business users can write:

```gherkin id="z9l2tm"
Feature: User API

  Scenario: Create a new user
    Given the API base URL is configured
    When I send a POST request to "/users" with payload:
      """
      {
        "name": "John"
      }
      """
    Then the response status should be 201
    And the response should contain "name" as "John"
```

---

### ✅ 2. Prompt + BDD Hybrid Support

* Accepts:

  * Natural language prompts
  * OR Gherkin feature files

---

### ✅ 3. Reuse Engine (No Duplicate Steps)

* Detects existing step definitions
* Reuses them instead of creating new ones
* Prevents duplication across scenarios

---

### ✅ 4. Application-Agnostic Design

* No hardcoded URLs or payloads
* Config-driven execution

---

### ✅ 5. Contract-Based API Layer

```json id="0p6k7h"
{
  "name": "createUser",
  "method": "POST",
  "endpoint": "/users",
  "expectedStatus": 201
}
```

---

### ✅ 6. Generic API Executor

One engine to handle all API requests dynamically.

---

## 🏗️ Architecture

```id="1c2m9s"
BDD Feature / Prompt
        ↓
   AI Parser Layer
        ↓
   Step Definition Mapper
        ↓
   Reuse Engine
        ↓
   API Contract Layer
        ↓
   Generic Executor
        ↓
   Playwright Runner
        ↓
   Reports
```

---

## 📁 Project Structure

```id="2l5n0v"
api-automation-framework/
│
├── src/
│   ├── features/            # BDD feature files (.feature)
│   ├── steps/               # Step definitions
│   ├── ai/                  # Prompt/Gherkin parser
│   ├── contracts/           # API definitions
│   ├── executor/            # API execution engine
│   ├── reuse/               # Deduplication logic
│   ├── config/              # App configs
│   └── utils/               # Helpers
│
├── prompts/                 # Optional prompt input
├── output/                  # Generated steps/tests
├── playwright.config.ts
├── cucumber.js
├── package.json
└── README.md
```

---

## ⚙️ Tech Stack

* TypeScript
* Node.js
* Playwright (API execution)
* Cucumber (BDD)
* Generative AI (LLM for parsing)

---

## 🔄 Workflow

### Step 1: Input

User provides:

* Gherkin `.feature` file
  **OR**
* Natural language prompt

---

### Step 2: AI Parsing

* Converts input into:

  * Structured steps
  * API contract

---

### Step 3: Reuse Check

* Existing step found → reuse
* New step → generate once

---

### Step 4: Step Binding

Maps:

* Gherkin steps → TypeScript step definitions

---

### Step 5: Execution

```bash id="o6p9ht"
npx cucumber-js
```

---

## 🧪 Sample Step Definition

```ts id="4u7sxp"
import { When, Then } from '@cucumber/cucumber';
import { executeAPI } from '../executor/apiExecutor';

let response;

When('I send a POST request to {string} with payload:', async function (endpoint, docString) {
  const payload = JSON.parse(docString);

  response = await executeAPI({
    method: 'post',
    endpoint,
    payload
  }, this.request);
});

Then('the response status should be {int}', async function (status) {
  if (response.status() !== status) {
    throw new Error(`Expected ${status} but got ${response.status()}`);
  }
});
```

---

## 🔁 Reuse Example

### Scenario 1:

```gherkin id="3c7b9x"
When I send a POST request to "/users"
```

👉 Step created

---

### Scenario 2:

```gherkin id="8d2k1p"
When I send a POST request to "/users"
```

👉 Step reused ✅

---

## 🌐 Multi-Application Support

Each app provides config:

```json id="5v8r2y"
{
  "appName": "ClientApp",
  "baseURL": "https://api.client.com",
  "auth": {
    "type": "Bearer",
    "token": "xyz"
  }
}
```

---

## ⚠️ Design Principles

* ✅ Business-readable scenarios (BDD)
* ✅ No duplicate step definitions
* ✅ No hardcoded API logic
* ✅ Separation of concerns
* ✅ Reusable architecture

---

## 🚧 Challenges & Solutions

| Challenge           | Solution             |
| ------------------- | -------------------- |
| Non-technical users | BDD (Gherkin)        |
| Duplicate steps     | Reuse engine         |
| Prompt ambiguity    | AI parsing           |
| Multi-app support   | Config-driven design |

---

## 🔮 Future Enhancements

* 🔹 Auto-generate feature files from prompts
* 🔹 Vector DB for smarter reuse
* 🔹 UI for business users
* 🔹 CI/CD integration
* 🔹 Advanced reporting

---

## 🧑‍💻 How to Run

### Install dependencies

```bash id="k3f8zn"
npm install
```

### Run BDD tests

```bash id="r9v2lx"
npx cucumber-js
```

---

## 💡 Conclusion

This framework transforms API testing into:

👉 Business-readable (BDD)
👉 AI-driven
👉 Fully automated

---

## 📌 POC Summary

> A GenAI-powered, BDD-based API automation framework where business users write scenarios, and the system converts them into reusable automated tests without duplication.

---

## ✍️ Author

POC developed for next-generation API automation using TypeScript + BDD + AI.

---