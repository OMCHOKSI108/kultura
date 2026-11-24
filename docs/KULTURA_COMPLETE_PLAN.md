# KULTURA AI: COMPLETE STARTUP MASTER PLAN & TECHNICAL BLUEPRINT

**Project Name:** Kultura (Kultura AI / Kultura.dev)  
**Category:** Enterprise Private AI Infrastructure & Developer Operating Platform  
**Target Market:** India (Primary Hub & Domestic IT/FinTech) + Global Mid-Market (US/EU)  
**Status:** Confidential / Internal Founding Team & Investor Review  
**Directory:** `ideas/Kultura/`  

---

## Table of Contents
1. [The Idea in Plain English](#1-the-idea-in-plain-english)
2. [The Architecture of Value: Two Front-Doors](#2-the-architecture-of-value-two-front-doors)
3. [Model Selection & Hardware Sizing](#3-model-selection--hardware-sizing)
4. [Complete Monorepo Codebase File Structure](#4-complete-monorepo-codebase-file-structure)
5. [Production Docker Compose Configuration](#5-production-docker-compose-configuration)
6. [Cloud AWS Infrastructure vs. On-Premise Workstation](#6-cloud-aws-infrastructure-vs-on-premise-workstation)
7. [Concurrency & Systems Engineering (40–50 Active Devs)](#7-concurrency--systems-engineering-4050-active-devs)
8. [The 200-User Enterprise Case Study: BEFORE vs. AFTER](#8-the-200-user-enterprise-case-study-before-vs-after)
9. [The 3-Tier RBAC & Enterprise Governance Matrix](#9-the-3-tier-rbac--enterprise-governance-matrix)
10. [Client Proposal & 14-Day Pilot Playbook](#10-client-proposal--14-day-pilot-playbook)
11. [14-Day Engineering Roadmap for the Founding Team](#11-14-day-engineering-roadmap-for-the-founding-team)

---

## 1. The Idea in Plain English

### The Core Problem
In any company with 50 to 500+ employees:
1. **Developers** use GitHub Copilot or Cursor to write code.
2. **Non-tech staff** (HR, Sales, Legal, Operations) use ChatGPT to write emails, review contracts, and answer customer questions.

This creates two massive problems:
* **The Cost Trap:** The company pays **$20 to $30/month per user** across separate accounts. For a 200-person company, that is **$4,400/month (₹3.7 Lakhs/month)**.
* **The Legal & Compliance Nightmare:** Employees paste client proprietary code, customer Aadhaar/PAN details, and internal financial figures into public cloud models. This directly violates client contracts (MSAs), ISO certifications, and data privacy laws.

### The Kultura Solution
**Kultura is an all-in-one, self-hosted AI operating system that deploys inside the company’s own AWS VPC (or on-premise GPU workstation) in 15 minutes.**

It provides:
* **An internal ChatGPT for non-tech employees** connected directly to company Google Drive / SharePoint documents.
* **A private Copilot API endpoint for developers** in VS Code / Cursor powered by **Qwen-2.5-Coder-32B** (matching 90% of Claude 3.5 Sonnet's coding power).
* **Automated Data Loss Prevention (DLP):** Customer PII, PAN, Aadhaar, and API keys are automatically scrubbed and replaced with temporary tokens before any prompt leaves the network.
* **3-Tier RBAC & Spend Quotas:** Full control for Admins and Team Leads over spending limits and audit trails.

---

## 2. The Architecture of Value: Two Front-Doors

```mermaid
flowchart TD
    subgraph ClientNetwork ["Customer Security Boundary (AWS VPC / Office LAN)"]
        direction TB
        
        subgraph FrontDoors ["Dual Ingress Layer"]
            FD1["Front-Door 1: Web Chat UI<br/>(HR, Sales, Legal, Ops)<br/>URL: ai.internal.company.com"]
            FD2["Front-Door 2: Developer API (/v1)<br/>(VS Code, Cursor, Continue.dev)<br/>URL: ai.internal.company.com/v1"]
        end

        subgraph CorePlatform ["Kultura Core Orchestration Engine"]
            GW["Node.js / TypeScript Gateway Proxy"]
            RBAC["3-Tier RBAC & Spend Quota Enforcer"]
            DLP["Reversible PII & Secret Scrubbing Engine"]
            Cache["Redis 7 Semantic Cache & BullMQ"]
            RAG["Incremental RAG Sync Worker (15-min cron)"]
            PG[("PostgreSQL 16 + pgvector<br/>(Embeddings, Audit Logs, Keys)")]
        end

        subgraph ExecutionLayer ["Inference & Execution Layer"]
            LocalGPU["Primary Local GPU: vLLM Engine<br/>Model: Qwen-2.5-Coder-32B-AWQ<br/>Latency: sub-150ms | Cost: $0.00"]
            CloudFallback["Cloud Circuit Breaker (Overflow / Complex)<br/>Claude 3.5 Sonnet / Azure OpenAI<br/>(PII-Scrubbed Upstream API)"]
        end
    end

    subgraph DataSources ["External Enterprise Connectors"]
        GDrive["Company Google Drive"]
        SharePoint["Microsoft 365 SharePoint"]
    end

    FD1 --> GW
    FD2 --> GW
    GW --> RBAC
    RBAC --> DLP
    DLP <--> Cache
    GW <--> RAG
    RAG <--> GDrive
    RAG <--> SharePoint
    RAG --> PG
    DLP -->|Normal Traffic: Queue < 15| LocalGPU
    DLP -->|Overflow / Peak Spike| CloudFallback
```

### Front-Door 1: The Non-Tech Web Chatbot
* **Audience:** HR, Sales, Legal, Operations, Finance.
* **How They Use It:** Browser at `https://ai.internal.company.com`.
* **Value:** Instant answers from internal company documents (PDFs, policies, proposals) without leaking company secrets.

### Front-Door 2: The Developer Endpoint (`/v1`)
* **Audience:** Software Engineers writing code in VS Code, Cursor, Continue.dev, or PyCharm.
* **How They Use It:** Drop-in OpenAI-compatible configuration:
  ```typescript
  const client = new OpenAI({
    baseURL: "https://ai.internal.company.com/v1",
    apiKey: "kultura_dev_key_rahul_9921",
  });
  ```
* **Value:** High-speed code autocomplete and multi-file refactoring without code leaving the corporate perimeter.

---

## 3. Model Selection & Hardware Sizing

```
+-----------------------------------------------------------------------------------------------------------------------------+
|                                              KULTURA PRODUCTION MODEL STACK                                                 |
+-----------------------------------------------------------------------------------------------------------------------------+
| Role / Task                    | Selected Model                      | Quantization & VRAM   | Benchmark & Why We Picked It         |
| :----------------------------- | :---------------------------------- | :-------------------- | :----------------------------------- |
| **1. Primary Heavy Coding &**  | **`Qwen/Qwen2.5-Coder-32B-Instruct`**| **AWQ (4-bit)**       | **Matches GPT-4o on HumanEval (92.7%)**|
| **Multi-File Reasoning**       |                                     | **~20GB – 22GB VRAM** | Sits at ~88–92% of Claude 3.5 Sonnet.|
|                                |                                     | **Fits on 1x 24GB GPU!**| Native 128,000 token context window.  |
| ------------------------------ | ----------------------------------- | --------------------- | ------------------------------------ |
| **2. Fast Inline Autocomplete**| **`Qwen/Qwen2.5-Coder-7B-Instruct`** | **AWQ (4-bit)**       | Sub-60ms time-to-first-token.         |
| **(Low-latency IDE typing)**   |                                     | **~5GB VRAM**         | Instant streaming for keystroke speed.|
| ------------------------------ | ----------------------------------- | --------------------- | ------------------------------------ |
| **3. Document Embeddings**     | **`nomic-ai/nomic-embed-text-v1.5`** | **FP16 / Uncompressed**| Outperforms OpenAI `text-embedding-3- |
| **(For Google Drive RAG)**     | OR **`BAAI/bge-m3`**                 | **~1.2GB VRAM / CPU** | small` on MTEB; runs 100% locally.   |
| ------------------------------ | ----------------------------------- | --------------------- | ------------------------------------ |
| **4. Cloud Fallback Safety**   | **Anthropic Claude 3.5 Sonnet**      | **Cloud HTTPS API**   | Used only when local GPU queue is     |
| **(Overflow Circuit Breaker)** | OR **Azure OpenAI GPT-4o**          | (Pay-as-you-go)       | full. Prompts are PII-scrubbed first. |
+-----------------------------------------------------------------------------------------------------------------------------+
```

---

## 4. Complete Monorepo Codebase File Structure

```
kultura/
├── apps/
│   ├── gateway/                         # High-Performance Reverse Proxy & Orchestrator
│   │   ├── src/
│   │   │   ├── index.ts                 # Fastify / Node.js 22 LTS entry point
│   │   │   ├── routes/
│   │   │   │   ├── v1/
│   │   │   │   │   ├── chat.ts          # POST /v1/chat/completions (OpenAI Compatible)
│   │   │   │   │   ├── models.ts        # GET /v1/models (Lists active local & cloud models)
│   │   │   │   │   └── embeddings.ts    # POST /v1/embeddings (Local vector generator)
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts              # API key verification & JWT parser
│   │   │   │   ├── rbac.ts              # Enforces User vs Team Lead vs Admin roles
│   │   │   │   ├── quota.ts             # Token-bucket rate limiter & spend caps
│   │   │   │   └── dlp.ts               # Reversible PII & secret tokenizer
│   │   │   ├── services/
│   │   │   │   ├── vllmClient.ts        # Direct client to local vLLM engine
│   │   │   │   ├── cloudFallback.ts     # Fallback router to Claude / Azure OpenAI
│   │   │   │   ├── circuitBreaker.ts    # Checks GPU queue depth (<15 requests)
│   │   │   │   └── semanticCache.ts     # Redis cache for identical queries
│   │   │   └── config/
│   │   │       └── env.ts               # Zod environment schema
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                             # Next.js 15 Web Portal (Dashboard + Chatbot)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/
│       │   │   │   └── login/page.tsx   # Google Workspace / Okta SSO
│       │   │   ├── (dashboard)/
│       │   │   │   ├── page.tsx         # Executive Analytics Cockpit
│       │   │   │   ├── keys/page.tsx    # API Key Management & Spend Limits
│       │   │   │   ├── teams/page.tsx   # Team Lead View: User breakdown & quotas
│       │   │   │   ├── logs/page.tsx    # Audit logs & blocked PII reports
│       │   │   │   └── settings/page.tsx# Google Drive & GPU Endpoint Settings
│       │   │   └── chat/
│       │   │       └── page.tsx         # Front-Door 1: Non-tech ChatGPT interface
│       │   ├── components/
│       │   │   ├── ui/                  # Shadcn UI component suite
│       │   │   ├── ChatWindow.tsx       # Markdown streaming chat with citations
│       │   │   ├── TokenCounter.tsx     # Real-time token usage progress bar
│       │   │   └── CostSavedCard.tsx    # "You saved $1,240 vs OpenAI this month"
│       │   └── lib/
│       │       └── auth.ts              # Authentication configuration
│       ├── Dockerfile
│       ├── package.json
│       └── tailwind.config.ts           # Dark-mode enterprise palette (Zinc + Emerald)
│
├── packages/
│   ├── database/                        # Database Schema & Migrations
│   │   ├── prisma/
│   │   │   └── schema.prisma            # PostgreSQL schema with pgvector
│   │   ├── src/
│   │   │   └── client.ts                # Shared Prisma client
│   │   └── package.json
│   │
│   ├── dlp-engine/                      # Data Loss Prevention & PII Masker
│   │   ├── src/
│   │   │   ├── patterns.ts              # Regex for PAN, Aadhaar, SSN, Credit Cards, Secrets
│   │   │   ├── tokenizer.ts             # Swaps sensitive data for <MASK_N>
│   │   │   ├── detokenizer.ts           # Restores real data on LLM response return
│   │   │   └── ner.ts                   # Fast lightweight entity recognition
│   │   └── package.json
│   │
│   └── rag-engine/                      # Document Ingestion & RAG Sync
│       ├── src/
│       │   ├── connectors/
│       │   │   ├── googleDrive.ts       # Google Drive API connector
│       │   │   └── localFolder.ts       # Local network folder / NAS reader
│       │   ├── processors/
│       │   │   ├── pdfParser.ts         # Extracts text from PDFs
│       │   │   └── chunker.ts           # Splits text into 500-token chunks with overlap
│       │   ├── workers/
│       │   │   └── syncCron.ts          # 15-min cron worker: checks MD5 hash of modified files
│       │   └── retriever.ts             # Cosine similarity vector search with RBAC filters
│       └── package.json
│
├── deploy/                              # Deployment & Infrastructure as Code
│   ├── docker-compose.yml               # Local/VPC single-command deployment
│   ├── docker-compose.gpu.yml           # Includes NVIDIA runtime for self-hosted GPU
│   ├── nginx.conf                       # Reverse proxy with SSL termination
│   └── terraform/                       # AWS VPC, ALB, and EC2 g5.xlarge automated deploy
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
│
├── scripts/
│   ├── install.sh                       # `curl -sSL https://get.kultura.dev | bash`
│   └── benchmark.sh                     # Runs vLLM throughput test against local GPU
│
├── .env.example
├── package.json
└── turbo.json
```

---

## 5. Production Docker Compose Configuration

```yaml
version: '3.8'

services:
  # 1. High-Performance Model Engine (vLLM)
  vllm-engine:
    image: vllm/vllm-openai:latest
    container_name: kultura-vllm
    runtime: nvidia
    restart: always
    environment:
      - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
    command: >
      --model Qwen/Qwen2.5-Coder-32B-Instruct-AWQ
      --quantization awq
      --gpu-memory-utilization 0.90
      --max-model-len 16384
      --port 8000
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    ports:
      - "8000:8000"

  # 2. Kultura Core Gateway & Reverse Proxy (Node.js/Fastify)
  kultura-gateway:
    build:
      context: .
      dockerfile: apps/gateway/Dockerfile
    container_name: kultura-gateway
    restart: always
    depends_on:
      - vllm-engine
      - kultura-db
      - kultura-redis
    environment:
      - PORT=8080
      - DATABASE_URL=postgresql://kultura:secretpass@kultura-db:5432/kultura_core
      - REDIS_URL=redis://kultura-redis:6379
      - LOCAL_VLLM_URL=http://vllm-engine:8000/v1
      - CLOUD_FALLBACK_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - "8080:8080"

  # 3. Web Dashboard & Internal ChatGPT (Next.js 15)
  kultura-web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: kultura-web
    restart: always
    depends_on:
      - kultura-gateway
    environment:
      - NEXTAUTH_URL=http://localhost:3000
      - NEXTAUTH_SECRET=${AUTH_SECRET}
      - GATEWAY_INTERNAL_URL=http://kultura-gateway:8080
    ports:
      - "3000:3000"

  # 4. PostgreSQL 16 + pgvector (Storage & Document Embeddings)
  kultura-db:
    image: pgvector/pgvector:pg16
    container_name: kultura-db
    restart: always
    environment:
      - POSTGRES_USER=kultura
      - POSTGRES_PASSWORD=secretpass
      - POSTGRES_DB=kultura_core
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # 5. Redis 7 (Semantic Cache & Rate-Limiter)
  kultura-redis:
    image: redis:7-alpine
    container_name: kultura-redis
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

volumes:
  postgres_data:
  redis_data:
```

---

## 6. Cloud AWS Infrastructure vs. On-Premise Workstation

### A. AWS In-VPC Deployment (Verified 2024–2026 Pricing)

| AWS Service | Specification | On-Demand Cost / Month | 1-Year Savings Plan |
| :--- | :--- | :--- | :--- |
| **EC2 GPU Host** | **`g5.xlarge`** (NVIDIA A10G 24GB VRAM, 4 vCPU, 16GB RAM) | **$734.38 / month** | **~$514.00 / month** |
| **Amazon RDS PostgreSQL** | `db.t4g.medium` (2 vCPU, 4GB RAM, 50GB gp3 with `pgvector`) | **$52.00 / month** | **$38.00 / month** |
| **Application Load Balancer** | AWS ALB (Internal network traffic) | **$22.50 / month** | **$22.50 / month** |
| **EBS Storage (gp3)** | 150GB gp3 (For model weights & OS) | **$12.00 / month** | **$12.00 / month** |
| **TOTAL AWS INFRASTRUCTURE** | **Full Production-Grade In-VPC Appliance** | **$820.88 / month** | **~$586.50 / month** |

### B. High-ROI On-Premise Alternative (Zero Monthly Cloud GPU Bills)
For Indian IT houses and FinTech firms wanting zero cloud GPU fees:
* **Hardware:** 1x 4U Server / Tower Workstation with **1x NVIDIA RTX 4090 (24GB VRAM)** OR **2x RTX 3090 (48GB total)**, AMD Ryzen 9, 64GB DDR5 RAM, 2TB NVMe SSD.
* **One-Time CapEx:** **₹2,80,000 to ₹3,40,000 (~$3,500 to $4,000)**.
* **Amortized Monthly Cost (36 Months):** **$105 / month** + $30/month electricity = **$135 / month total infra bill**!
* **Savings:** Eliminates the $734/month AWS bill, saving an extra **$8,100 (₹6.8 Lakhs) every year**.

---

## 7. Concurrency & Systems Engineering (40–50 Active Devs)

* **Peak vs. Continuous Concurrency:** 50 active developers do not generate 50 parallel requests at the same millisecond. Autocomplete triggers generate an average of **2 to 5 concurrent in-flight calls**, peaking at 8 to 12.
* **vLLM Continuous Batching:** Unlike default sequential inference, vLLM batches parallel requests into a single GPU computation, delivering **180--240 tokens/second aggregate throughput** on an A10G.
* **Circuit Breaker Fail-Safe:** If the local GPU queue depth exceeds 15 requests, Kultura automatically scrubs PII and routes overflow prompts to cloud fallback APIs. Response latency remains sub-second without server crashes.

---

## 8. The 200-User Enterprise Case Study: BEFORE vs. AFTER

| Parameter | BEFORE (Current Commercial SaaS) | AFTER (Kultura on AWS VPC) | AFTER (Kultura On-Prem Workstation) |
| :--- | :--- | :--- | :--- |
| **100 Developers Tooling** | 100x GitHub Copilot @ $19 = **$1,900/mo** | Included in platform | Included in platform |
| **100 Non-Tech Staff Tooling** | 100x ChatGPT Team @ $25 = **$2,500/mo** | Included in platform | Included in platform |
| **Underlying Infrastructure** | $0 (Hosted by OpenAI/Microsoft) | AWS `g5.xlarge` + RDS = **$820 / mo** | 1x Server Amortization = **$135 / mo** |
| **Cloud Fallback / Overflow** | $0 | **$250 / mo** (API tokens) | **$250 / mo** (API tokens) |
| **Kultura Platform License** | $0 | **$1,299 / mo** (SaaS Fee) | **$1,299 / mo** (SaaS Fee) |
| **TOTAL MONTHLY EXPENSE** | **$4,400 / month (₹3,70,000/mo)** | **$2,369 / month** | **$1,684 / month (₹1,41,000/mo)** |
| **TOTAL ANNUAL SPEND** | **$52,800 / year (₹44.4 Lakhs/yr)** | **$28,428 / year** | **$20,208 / year (₹17.0 Lakhs/yr)** |
| **NET ANNUAL CASH SAVINGS** | **BASELINE (Zero Savings)** | **SAVE $24,372 / YEAR! (46.2% NET)** | **SAVE $32,592 / YEAR! (61.7% NET)** |
| **Data Privacy & Compliance** | High risk; client code on public cloud | **100% In-VPC (Zero Leaks)** | **100% Air-Gapped (Zero Leaks)** |
| **Internal Knowledge Search** | None (Generic models) | **Live Google Drive RAG** | **Live Google Drive / NAS RAG** |
| **Admin Control & RBAC** | Disjointed billing accounts | **3-Tier Unified Cockpit** | **3-Tier Unified Cockpit** |

---

## 9. The 3-Tier RBAC & Enterprise Governance Matrix

```
+-----------------------------------------------------------------------------------------+
|                                  THE 3-TIER RBAC MODEL                                  |
+-----------------------------------------------------------------------------------------+
| Role           What They Can See & Do                                                   |
| -------------  ------------------------------------------------------------------------ |
| 1. User        - Sees their own personal chat history and prompt logs.                  |
|    (Developer  - Sees their own token usage and monthly quota balance                   |
|     or Staff)    (e.g., "Used $18 of my $50 monthly budget").                           |
|                - Can generate their own personal API key for VS Code / Cursor.          |
|                                                                                         |
| 2. Team Lead   - Sees all users under their department (e.g., "Frontend Team").         |
|    (Engineering- Sees aggregated team spend & individual developer breakdown.           |
|     Manager)   - Can set team-level model defaults (e.g., "Force DeepSeek for my team").|
|                - Can approve temporary budget extensions.                               |
|                                                                                         |
| 3. Admin       - Master Cockpit: Sees all teams (Engineering, HR, Marketing, Finance).  |
|    (CTO / IT   - Master budget caps (e.g., "Whole company cap: $2,000/mo").             |
|     Head)      - 1-Click Kill Switch: Instantly revoke any key or disable any user.     |
|                - Full security audit log (exportable as CSV/PDF for compliance audits). |
|                - Add/remove GPU nodes and configure Cloud API credentials.              |
+-----------------------------------------------------------------------------------------+
```

---

## 10. Client Proposal & 14-Day Pilot Playbook

### The Cold Outreach Script (Target: CTOs / VPs of Engineering)
> **Subject:** Eliminating Copilot code leaks & cutting your AI bill by 45%  
>
> *"Hi [First Name],  
> If your developers use GitHub Copilot and your staff use ChatGPT, you're likely spending $3,000–$5,000/month across disconnected accounts while risking client NDA violations by sending proprietary code to public models.  
>
> We built **Kultura**, a self-hosted AI platform deployed in your AWS VPC in 15 minutes. It gives your developers a private Copilot powered by Qwen-2.5-Coder-32B (matching 90% of Claude 3.5 Sonnet's coding power) and an internal ChatGPT for Google Drive.  
>
> Can I deploy a free 14-day parallel pilot in your staging VPC this Thursday? We'll demonstrate an instant 40%+ cost reduction with zero data leaks.  
>
> Best,  
> [Founder Name] | Founder, Kultura.dev"*

### The 14-Day Pilot Closing Strategy
1. **Day 1 (Installation):** Deploy the Docker Compose stack on an AWS `g5.xlarge` instance in the client's staging VPC (takes 15 minutes).
2. **Day 2–7 (Developer Test):** Onboard 5 senior developers using VS Code / Cursor. Have them test multi-file refactoring and code autocomplete against Qwen-32B.
3. **Day 8–13 (Staff Test):** Connect one test Google Drive folder (e.g., HR policies). Allow 10 staff members to test document queries.
4. **Day 14 (The Reveal & Close):** Present the CTO with the executive audit report:  
   *`"In 14 days, your 15 pilot users completed 4,200 prompts. Zero bytes left your VPC. You saved $620 compared to public SaaS seat rates. Converting your full 100-person team to Kultura will save you ₹18 Lakhs ($21,500) this year."`*

---

## 11. 14-Day Engineering Roadmap for the Founding Team

1. **Days 1–3 (Model & GPU Validation):**  
   * Spend $10 (₹850) on RunPod.io. Spin up 1x RTX 4090 (24GB).
   * Deploy `vLLM` with `Qwen/Qwen2.5-Coder-32B-Instruct-AWQ`.
   * Connect your own local VS Code to test coding speed and accuracy on your personal projects.
2. **Days 4–8 (Core Gateway & DLP Build):**  
   * Build the Node.js/TypeScript reverse proxy supporting `/v1/chat/completions`.
   * Implement the reversible PII masking middleware (regex/NER).
   * Implement API key authentication and PostgreSQL usage logging.
3. **Days 9–11 (Admin Cockpit & Chat UI):**  
   * Assemble the Next.js dark-mode dashboard with Shadcn UI.
   * Add the web chat interface and API key generator.
4. **Days 12–14 (Docker Packaging & Client Outreach):**  
   * Package everything into a single `docker-compose.yml`.
   * Reach out to 10 CTOs in your network using the cold outreach script to book your first 2 pilot deployments.
