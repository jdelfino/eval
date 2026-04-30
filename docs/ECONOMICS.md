# Economics

This document covers hosting costs and per-student cost projections for the platform.

- **Current infrastructure costs** — actual monthly GCP spend for a running deployment
- **Per-student projections** — estimated future costs when students are actively using the platform

---

## Current Infrastructure Costs (~$77/month)

These are the actual monthly costs for a running GKE deployment, independent of student usage.

| Component | GCP Service | Monthly Cost |
|-----------|-------------|--------------|
| Kubernetes | GKE | $0 control plane + ~$35 pods |
| Database | Cloud SQL (db-g1-small) | ~$15 |
| Authentication | Identity Platform | Free tier |
| NAT Gateway | NAT VM (e2-micro) | ~$6 |
| Load Balancer | Cloud Load Balancing | ~$20 |
| State Storage | Cloud Storage (GCS) | < $1 |
| **Total** | | **~$77** |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full infrastructure diagram and technology choices.

---

## Future Per-Student Costs

The following are projections based on GKE Standard with Spot instances for student workspaces. Preemption is tolerable because Coder auto-commits every ~10 seconds; students experience at most a brief restart.

### Assumptions

- 15-week semester
- 10 hours/week active development (150 hours/semester, conservatively high — many students will use half)
- 2 assignments per week, 30 submissions total
- 1-2 vCPU, 2-4 GB RAM workspace

### Compute Costs (GKE)

Platform services (API, Centrifugo, executor, Coder server) and student workspace pods all run on Spot node pools.

GKE e2 instance pricing: ~$0.034/vCPU/hr + ~$0.005/GB/hr on-demand, ~60-70% discount for Spot.

**1 vCPU / 2 GB workspace (~$0.044/hr on-demand, ~$0.014/hr Spot):**

| Component | Usage | On-Demand | Spot |
|-----------|-------|-----------|------|
| Student workspace | 150 hours | $6.60 | $2.10 |
| Student workspace | 75 hours (realistic) | $3.30 | $1.05 |
| Grading workspace | ~10 hours | $0.44 | $0.14 |
| Test execution | ~2.5 hours | $0.11 | $0.04 |

**2 vCPU / 4 GB workspace (~$0.088/hr on-demand, ~$0.028/hr Spot):**

| Component | Usage | On-Demand | Spot |
|-----------|-------|-----------|------|
| Student workspace | 150 hours | $13.20 | $4.20 |
| Student workspace | 75 hours (realistic) | $6.60 | $2.10 |
| Grading workspace | ~10 hours | $0.88 | $0.28 |
| Test execution | ~2.5 hours | $0.22 | $0.07 |

Idle timeout (handled by Coder) significantly reduces actual billed hours — students who walk away don't burn compute.

### Storage and Platform Costs

| Component | Usage | Cost |
|-----------|-------|------|
| Persistent volume (10 GB) | 15 weeks | ~$0.50 |
| Database (amortized) | Negligible per student | ~$0.10 |
| Platform hosting (amortized) | Negligible per student | ~$0.20 |

### Total Cost Per Student Per Semester

| Scenario | 1 vCPU/2 GB | 2 vCPU/4 GB |
|----------|-------------|-------------|
| **On-demand, 150 hrs, no AI** | ~$7.50 | ~$14.50 |
| **Spot, 150 hrs, no AI** | ~$3.00 | ~$5.00 |
| **Spot, 75 hrs (realistic), no AI** | ~$1.90 | ~$3.00 |
| **Spot, 75 hrs + AI grading** | ~$3.00 - $5.00 | ~$4.00 - $6.00 |

### Scaling Estimates (Spot, realistic usage)

**200-student course (1 vCPU/2 GB, 75 hrs avg):**

| Scenario | Per Semester |
|----------|--------------|
| No AI | ~$380 |
| With AI grading | ~$600 - $1,000 |

**10-course department (2,000 students):**

| Scenario | Per Semester |
|----------|--------------|
| No AI | ~$3,800 |
| With AI grading | ~$6,000 - $10,000 |

---

## AI Grading Costs

These costs are additive to compute costs above, and only apply if AI grading is enabled.

### API Pricing (per million tokens)

| Model | Input | Output |
|-------|-------|--------|
| Haiku 4.5 | $1 | $5 |
| Sonnet 4.5 | $3 | $15 |
| Opus 4.5 | $5 | $25 |

**Discounts available:**
- Batch API: 50% discount (async processing)
- Prompt caching: Up to 90% savings on repeated context

### Per-Submission Cost Estimate

**Assumptions for intro CS assignment:**
- ~500 lines of code (~2,000 tokens)
- Test output: ~500 tokens per run
- 3 bugs on average
- 2 attempts per bug on average (6 iterations total)

**Per iteration:**
- Input: ~3,200 tokens (system prompt + code + test output + instruction)
- Output: ~500 tokens (analysis + fix)

**Per submission:**
- Input: 6 × 3,200 = 19,200 tokens
- Output: 6 × 500 = 3,000 tokens

| Model | Input Cost | Output Cost | Total per Submission |
|-------|-----------|-------------|---------------------|
| Haiku 4.5 | $0.019 | $0.015 | **$0.03** |
| Sonnet 4.5 | $0.058 | $0.045 | **$0.10** |
| Opus 4.5 | $0.096 | $0.075 | **$0.17** |

### Scaled AI Costs

**Per course (200 students × 10 assignments = 2,000 submissions):**

| Model | Cost per Course |
|-------|-----------------|
| Haiku 4.5 | $60 |
| Sonnet 4.5 | $200 |
| Opus 4.5 | $340 |

**Per department (10 courses per semester):**

| Model | Cost per Semester |
|-------|-------------------|
| Haiku 4.5 | $600 |
| Sonnet 4.5 | $2,000 |
| Opus 4.5 | $3,400 |

### Cost Optimizations

1. **Prompt caching:** Cache system prompt + assignment context across submissions (20-30% savings)
2. **Batch API:** Run agent overnight before TAs grade (50% discount)
3. **Tiered model selection:** Start with Haiku, escalate to Sonnet only if needed

**Optimized realistic cost: $0.02-0.05 per submission**

### ROI Comparison

A TA costs ~$15-20/hour. If the AI agent saves even 2 minutes per submission, it pays for itself many times over.

---

## Comparison to Alternatives

| Service | Cost Per Student/Semester | Notes |
|---------|---------------------------|-------|
| GitHub Codespaces | ~$30-50 | 60 core-hours free, then $0.18/hour |
| Gitpod | ~$25-40 | 50 hours free, then paid |
| Replit Teams for Edu | ~$7-15 | Education pricing |
| **This platform (Spot)** | ~$2-6 | Self-hosted on GKE |

---

## Cost Sensitivity

| Factor | Impact |
|--------|--------|
| Workspace hours per student | High — 150 vs 75 hours = 2x cost difference |
| Spot vs on-demand | High — ~3x cost difference |
| Workspace spec (1 vs 2 vCPU) | High — 2x cost difference |
| AI grading adoption | Medium — adds $1-3/student |
| Idle timeout aggressiveness | Medium — reduces effective hours |
| Number of submissions | Low — grading compute is small |

The biggest cost lever is workspace utilization. Idle timeout and Spot pricing together bring per-student costs well under $5/semester for most realistic usage patterns.

---

## Business Model Notes

| Pricing Strategy | Price Point | Margin |
|------------------|-------------|--------|
| Per-student/semester | $15-25 | 75-90% |
| Per-course/semester (200 students) | $2,000-3,000 | 75-85% |
| Site license (department) | $15,000-25,000/year | 70-85% |
