<h1 align="center">Kultura</h1>

<p align="center">A minimal, dark-themed chat interface built with Next.js.</p>

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS"></a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Kultura demo" width="100%" />
</p>

## Features

- Streaming-style replies with collapsible thinking steps
- Model switcher for the Mistral family
- Resizable chat history sidebar
- Markdown and code block rendering
- Message stats, copy, and delete actions
- Fully dark UI

## Getting started

```bash
npm install --prefix client
cp .env.example .env

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4

## Recording the demo

The walkthrough above is produced by a Playwright script:

```bash
python3.12 automation/record_demo.py
```

It starts the dev server, records the flow, and writes a raw video to `automation/recordings/`. The rendered clip is also available as [assets/demo.mp4](assets/demo.mp4).

<details>
<summary>Static screenshot</summary>
<p align="center"><img src="assets/newchatarea.png" alt="Kultura new chat" width="100%" /></p>
</details>
