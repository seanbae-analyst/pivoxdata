// series.mjs — what the trends radar watches, in one place.
// Each group is read the same way every week, so a change in a number is a change in the world, not in the method.
// Adding a package or keyword here is the whole change: fetch → verify → build pick it up.

// npm (JavaScript) daily downloads, from 2023-01-01. `group` decides which chart and which share a package joins.
export const NPM = [
  // LLM vendor SDKs
  { pkg: "openai", group: "sdk", name: "OpenAI" },
  { pkg: "@anthropic-ai/sdk", group: "sdk", name: "Anthropic" },
  { pkg: "@google/genai", group: "sdk", name: "Google GenAI" },
  { pkg: "@mistralai/mistralai", group: "sdk", name: "Mistral" },
  // Vercel AI SDK model providers: which model app developers wire in
  { pkg: "@ai-sdk/openai", group: "provider", name: "OpenAI" },
  { pkg: "@ai-sdk/anthropic", group: "provider", name: "Anthropic" },
  { pkg: "@ai-sdk/google", group: "provider", name: "Google" },
  { pkg: "@ai-sdk/mistral", group: "provider", name: "Mistral" },
  { pkg: "@ai-sdk/xai", group: "provider", name: "xAI" },
  { pkg: "@ai-sdk/deepseek", group: "provider", name: "DeepSeek" },
  // agent / tooling layer
  { pkg: "ai", group: "tooling", name: "Vercel AI SDK" },
  { pkg: "@modelcontextprotocol/sdk", group: "tooling", name: "MCP SDK" },
  { pkg: "langchain", group: "tooling", name: "LangChain" },
  { pkg: "@langchain/langgraph", group: "tooling", name: "LangGraph" },
  { pkg: "@openai/agents", group: "tooling", name: "OpenAI Agents" },
  { pkg: "@mastra/core", group: "tooling", name: "Mastra" },
  { pkg: "ollama", group: "tooling", name: "Ollama" },
];

// Control packages: everyday libraries with no AI story. A counting change at the source moves them too; an AI
// boom does not. signals.mjs looks for breaks in these, never in the AI packages themselves.
export const NPM_CONTROL = ["react", "lodash", "express", "typescript", "axios"].map((pkg) => ({ pkg, group: "control", name: pkg }));
export const PYPI_CONTROL = ["requests", "numpy", "pandas", "urllib3", "packaging"].map((pkg) => ({ pkg, group: "control", name: pkg }));

// PyPI (Python) daily downloads without mirrors. pypistats serves the last ~180 days; older days are kept from
// earlier runs, so the history grows by itself.
export const PYPI = [
  { pkg: "openai", group: "sdk", name: "OpenAI" },
  { pkg: "anthropic", group: "sdk", name: "Anthropic" },
  { pkg: "google-genai", group: "sdk", name: "Google GenAI" },
  { pkg: "mistralai", group: "sdk", name: "Mistral" },
  { pkg: "langchain", group: "tooling", name: "LangChain" },
  { pkg: "langgraph", group: "tooling", name: "LangGraph" },
  { pkg: "llama-index", group: "tooling", name: "LlamaIndex" },
  { pkg: "mcp", group: "tooling", name: "MCP SDK" },
  { pkg: "fastmcp", group: "tooling", name: "FastMCP" },
  { pkg: "openai-agents", group: "tooling", name: "OpenAI Agents" },
  { pkg: "pydantic-ai", group: "tooling", name: "Pydantic AI" },
  { pkg: "crewai", group: "tooling", name: "CrewAI" },
  { pkg: "dspy", group: "tooling", name: "DSPy" },
  { pkg: "litellm", group: "tooling", name: "LiteLLM" },
  { pkg: "transformers", group: "infra", name: "Transformers" },
  { pkg: "vllm", group: "infra", name: "vLLM" },
  { pkg: "sglang", group: "infra", name: "SGLang" },
  { pkg: "torch", group: "infra", name: "PyTorch" },
];

// Topic packages (PyPI) for the non-AI topic tabs. Same reading as above; they rank only against each other, with a
// lower floor (TOPIC_MIN_LEVEL) because a quantum library has thousands of downloads a day, not millions.
PYPI.push(
);
export const TOPIC_MIN_LEVEL = 1000;

// ---------- races: who is winning in each corner of AI, by what developers actually install ----------
// Each race is a handful of rival packages in one source; the page shows each one's share of the race's downloads,
// how that share moved (4 weeks, 3 months, a year — PyPI only since its count changed in 2026-08), and who grows
// fastest. A change of leader is a big case. `what` explains the corner in everyday words.
// Packages not watched elsewhere are added to NPM / PYPI with group "race": fetched like the rest, never ranked
// among the AI packages. (langsmith is left out of the quality race: langchain installs it, so its count is langchain's.)
const m = (pkg, name) => ({ pkg, name });
export const RACES = [
  { id: "labs-js", name: "AI 회사 SDK · 자바스크립트", what: "웹·앱 개발자가 어느 회사 AI를 코드에 붙이나", src: "npm",
    members: [m("openai", "OpenAI"), m("@anthropic-ai/sdk", "Anthropic"), m("@google/genai", "Google"), m("@mistralai/mistralai", "Mistral")] },
  { id: "labs-py", name: "AI 회사 SDK · 파이썬", what: "AI·데이터 개발자가 어느 회사 AI를 코드에 붙이나", src: "pypi",
    members: [m("openai", "OpenAI"), m("anthropic", "Anthropic"), m("google-genai", "Google"), m("mistralai", "Mistral")] },
  { id: "labs-app", name: "앱에 연결하는 모델", what: "AI 앱을 만들 때 어느 회사 모델을 연결하나 (Vercel AI SDK)", src: "npm",
    members: [m("@ai-sdk/openai", "OpenAI"), m("@ai-sdk/anthropic", "Anthropic"), m("@ai-sdk/google", "Google"), m("@ai-sdk/xai", "xAI"), m("@ai-sdk/deepseek", "DeepSeek"), m("@ai-sdk/mistral", "Mistral")] },
  { id: "coding", name: "AI 코딩 도구", what: "터미널에서 코드를 대신 짜 주는 AI 도구", src: "npm",
    members: [m("@openai/codex", "Codex"), m("@anthropic-ai/claude-code", "Claude Code"), m("opencode-ai", "OpenCode"), m("@google/gemini-cli", "Gemini CLI"), m("@qwen-code/qwen-code", "Qwen Code")] },
  { id: "agents-py", name: "에이전트 도구 · 파이썬", what: "AI가 여러 단계를 스스로 하게 만드는 개발 도구", src: "pypi",
    members: [m("langgraph", "LangGraph"), m("openai-agents", "OpenAI Agents"), m("google-adk", "Google ADK"), m("pydantic-ai", "Pydantic AI"), m("crewai", "CrewAI"), m("smolagents", "smolagents")] },
  { id: "agents-js", name: "에이전트 도구 · 자바스크립트", what: "AI가 여러 단계를 스스로 하게 만드는 개발 도구", src: "npm",
    members: [m("@langchain/langgraph", "LangGraph"), m("@mastra/core", "Mastra"), m("@openai/agents", "OpenAI Agents"), m("@voltagent/core", "VoltAgent")] },
  { id: "vector", name: "벡터 DB", what: "AI가 문서를 기억하고 찾아오게 하는 저장소", src: "pypi",
    members: [m("qdrant-client", "Qdrant"), m("faiss-cpu", "FAISS"), m("chromadb", "Chroma"), m("lancedb", "LanceDB"), m("weaviate-client", "Weaviate"), m("pinecone", "Pinecone"), m("pymilvus", "Milvus")] },
  { id: "local", name: "모델 직접 돌리기", what: "내 컴퓨터나 회사 서버에서 AI 모델을 돌리는 도구", src: "pypi",
    members: [m("ollama", "Ollama"), m("vllm", "vLLM"), m("sglang", "SGLang"), m("mlx-lm", "MLX (맥)"), m("llama-cpp-python", "llama.cpp")] },
  { id: "browser", name: "AI의 웹 브라우저 조작", what: "AI가 웹사이트를 직접 누르고 입력하게 하는 도구", src: "npm",
    members: [m("@browserbasehq/stagehand", "Stagehand (AI용)"), m("puppeteer", "Puppeteer"), m("playwright", "Playwright")] },
  { id: "voice", name: "음성 AI", what: "말을 글로(받아쓰기), 글을 말로(목소리) 바꾸는 AI", src: "pypi",
    members: [m("faster-whisper", "faster-whisper"), m("elevenlabs", "ElevenLabs"), m("openai-whisper", "Whisper"), m("deepgram-sdk", "Deepgram")] },
  { id: "quality", name: "AI 품질 관리", what: "AI 답변이 맞는지 평가하고 지켜보는 도구", src: "pypi",
    members: [m("langfuse", "Langfuse"), m("deepeval", "DeepEval"), m("ragas", "Ragas"), m("arize-phoenix", "Phoenix")] },
  { id: "finetune", name: "모델 맞춤 학습", what: "공개 모델을 우리 데이터로 더 가르치는 도구 (파인튜닝)", src: "pypi",
    members: [m("peft", "PEFT"), m("trl", "TRL"), m("unsloth", "Unsloth")] },
];
for (const r of RACES) for (const x of r.members) {
  const list = r.src === "npm" ? NPM : PYPI;
  if (!list.some((p) => p.pkg === x.pkg)) list.push({ pkg: x.pkg, group: "race", name: x.name });
}

// arXiv: monthly count of AI papers (cs.AI, cs.CL or cs.LG listed) whose abstract contains the phrase.
export const ARXIV_SCOPE = "(cat:cs.AI OR cat:cs.CL OR cat:cs.LG)";
export const ARXIV_START = "202301";
export const ARXIV = [
  { id: "agent", q: "agent", name: "에이전트 (agent)" },
  { id: "reasoning", q: "reasoning", name: "추론 (reasoning)" },
  { id: "rag", q: "\"retrieval-augmented\"", name: "검색 증강 (retrieval-augmented)" },
  { id: "moe", q: "\"mixture of experts\"", name: "전문가 혼합 (mixture of experts)" },
  { id: "rl", q: "\"reinforcement learning\"", name: "강화학습 (reinforcement learning)" },
  { id: "testtime", q: "\"test-time\"", name: "테스트 시점 연산 (test-time)" },
  { id: "multimodal", q: "multimodal", name: "멀티모달 (multimodal)" },
  { id: "diffusion", q: "diffusion", name: "디퓨전 (diffusion)" },
  { id: "worldmodel", q: "\"world model\"", name: "월드 모델 (world model)" },
  { id: "ssm", q: "\"state space model\"", name: "상태 공간 모델 (state space model)" },
  { id: "slm", q: "\"small language model\"", name: "소형 언어 모델 (small language model)" },
  { id: "mcp", q: "\"model context protocol\"", name: "MCP (model context protocol)" },
  { id: "codegen", q: "\"code generation\"", name: "코드 생성 (code generation)" },
  { id: "hallucination", q: "hallucination", name: "환각 (hallucination)" },
  { id: "embodied", q: "embodied", name: "체화 (embodied)" },
];

// More research fields, read the same way (share of the field's papers whose abstract has the phrase).
// Each field is one or more arXiv categories. They start in 2025-01: 15 months are needed for "the same 3 months a
// year earlier", and the rest is chart history that older runs can extend.
// The site follows AX for IT consulting (2026-10-25): research fields outside AI (quantum, robotics, vision, security,
// systems) were dropped — what businesses adopt is read from the AX data and the official announcements instead.
export const ARXIV_DOMAINS = [
  { id: "ai", name: "AI", scope: ARXIV_SCOPE, start: ARXIV_START, terms: ARXIV },
];

// Hugging Face: one snapshot per run of the most-downloaded and the trending models, plus trending lists for the
// tasks some topics map to.
export const HF = { top: 300, trending: 50, tasks: [] };

// The developer-side tab: the radar above (SDK downloads, papers, open models, big-tech capex), shown as context for AX.
export const TOPICS = [
  { id: "ai", name: "개발 현장" },
];

// SEC EDGAR XBRL (companyfacts): capital expenditure — cash paid for property and equipment (data centres, servers,
// chips). Cash-flow facts are filed year-to-date, so fetch.mjs derives each quarter by difference; verify.mjs checks
// that four derived quarters add up to the annual 10-K figure. US government data; SEC asks for a User-Agent with contact.
// ---------- AX: how businesses take up AI ----------
// Ramp AI Index (Ramp Economics Lab), as published on FRED: the share of US businesses on Ramp's card and bill-pay
// platform (70,000+) that paid for an AI product that month — overall, by AI company, by company size and by
// industry. Paid tools only: free tiers and personal accounts are not counted. FRED marks it "copyrighted:
// citation required", so every card names it.
export const AX = {
  source: "Ramp AI Index (FRED)",
  series: [
    { id: "RAMPAIALL", group: "all", name: "전체" },
    { id: "RAMPAIANTHROPIC", group: "vendor", name: "Anthropic" },
    { id: "RAMPAIOPENAI", group: "vendor", name: "OpenAI" },
    { id: "RAMPAIXAI", group: "vendor", name: "xAI" },
    { id: "RAMPAIENTERPRISE", group: "size", name: "대기업" },
    { id: "RAMPAIMIDMARKET", group: "size", name: "중견기업" },
    { id: "RAMPAISMB", group: "size", name: "중소기업" },
    { id: "RAMPAITECH", group: "industry", name: "IT·기술" },
    { id: "RAMPAIFINANCE", group: "industry", name: "금융·보험" },
    { id: "RAMPAIMANUFACTURING", group: "industry", name: "제조" },
    { id: "RAMPAIRETAIL", group: "industry", name: "소매" },
    { id: "RAMPAICONSTRUCTION", group: "industry", name: "건설" },
    { id: "RAMPAIHEALTHCARE", group: "industry", name: "의료·복지" },
    { id: "RAMPAIHOSPITALITY", group: "industry", name: "숙박·외식" },
  ],
};

export const SEC = {
  // SEC refuses requests without an e-mail contact; this is the operator's published address (SEC_CONTACT overrides)
  ua: `pivoxdata-trends research ${process.env.SEC_CONTACT || "support@pivoxquant.com"}`,
  concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  companies: [
    { cik: "0000789019", id: "msft", name: "Microsoft" },
    { cik: "0001652044", id: "googl", name: "Alphabet" },
    { cik: "0001018724", id: "amzn", name: "Amazon" },
    { cik: "0001326801", id: "meta", name: "Meta" },
    { cik: "0001341439", id: "orcl", name: "Oracle" },
  ],
};

// ---------- AX news: primary sources only ----------
// What companies and governments announced themselves — their own newsrooms, blogs and press-release feeds, never
// media reports or aggregators — so every sentence a post makes can point to who said it, when, and where. An item
// is kept only if its link is on the source's own domain (`domains`) and it reads as AX: AI together with business
// adoption, partnerships or work (companies), or AI at all (governments, research). `html`: no feed, so the news page's
// article links are read and each article's own meta tags give the title, summary and date.
export const NEWS = {
  days: 120, // items older than this are dropped (the IT-domain cards compare the last 30 days with the 30 before)
  sources: [
    { id: "openai", name: "OpenAI", kind: "company", url: "https://openai.com/news/rss.xml", domains: ["openai.com"] },
    { id: "anthropic", name: "Anthropic", kind: "company", html: "https://www.anthropic.com/news", domains: ["anthropic.com"] },
    { id: "google-ai", name: "Google", kind: "company", url: "https://blog.google/technology/ai/rss/", domains: ["blog.google"] },
    { id: "google-cloud", name: "Google Cloud", kind: "company", url: "https://blog.google/products/google-cloud/rss/", domains: ["blog.google"] },
    { id: "microsoft", name: "Microsoft", kind: "company", url: "https://blogs.microsoft.com/feed/", domains: ["microsoft.com"] },
    { id: "microsoft-source", name: "Microsoft", kind: "company", url: "https://news.microsoft.com/source/feed/", domains: ["microsoft.com"] },
    { id: "amazon", name: "Amazon", kind: "company", url: "https://www.aboutamazon.com/news/rss.xml", domains: ["aboutamazon.com"] },
    { id: "nvidia", name: "NVIDIA", kind: "company", url: "https://blogs.nvidia.com/feed/", domains: ["nvidia.com"] },
    { id: "salesforce", name: "Salesforce", kind: "company", url: "https://www.salesforce.com/news/feed/", domains: ["salesforce.com"] },
    { id: "sap", name: "SAP", kind: "company", url: "https://news.sap.com/feed/", domains: ["sap.com"] },
    { id: "databricks", name: "Databricks", kind: "company", url: "https://www.databricks.com/feed", domains: ["databricks.com"] },
    { id: "snowflake", name: "Snowflake", kind: "company", url: "https://www.snowflake.com/feed/", domains: ["snowflake.com"] },
    { id: "samsung", name: "삼성전자", kind: "company", url: "https://news.samsung.com/kr/feed", domains: ["samsung.com"] },
    { id: "skt", name: "SK텔레콤", kind: "company", url: "https://news.sktelecom.com/feed", domains: ["sktelecom.com"] },
    { id: "msit", name: "과학기술정보통신부", kind: "government", url: "https://www.msit.go.kr/user/rss/rss.do?bbsSeqNo=94", domains: ["msit.go.kr"] },
    { id: "eu", name: "EU 집행위원회", kind: "government", url: "https://ec.europa.eu/commission/presscorner/api/rss?language=en", domains: ["ec.europa.eu"] },
    { id: "ukgov", name: "영국 정부", kind: "government", url: "https://www.gov.uk/search/news-and-communications.atom?keywords=artificial+intelligence", domains: ["gov.uk"] },
    { id: "nist", name: "미국 NIST", kind: "government", url: "https://www.nist.gov/news-events/news/rss.xml", domains: ["nist.gov"] },
    { id: "mckinsey", name: "McKinsey", kind: "research", url: "https://www.mckinsey.com/insights/rss", domains: ["mckinsey.com"] },
    { id: "capgemini", name: "Capgemini", kind: "company", url: "https://www.capgemini.com/feed/", domains: ["capgemini.com"] },
  ],
  // AX = AI + business; checked on the title and summary
  ai: /\b(AI|A\.I\.|artificial intelligence|generative|gen ?AI|LLMs?|agentic|AI agents?|Claude|ChatGPT|GPT-?\d[\w.]*|Gemini|Copilot|machine learning)\b|인공지능|생성형|에이전트/i,
  business: /\b(enterprises?|business(es)?|compan(y|ies)|customers?|clients?|organi[sz]ations?|banks?|banking|insurers?|insurance|retail(ers)?|manufactur\w*|healthcare|hospitals?|public sector|governments?|deploy\w*|adopt\w*|partner\w*|collaborat\w*|agreements?|roll(s|ed|ing)? out|at scale|workforce|employees|workers|productivity|transformation|operations|industr(y|ies))\b|기업|도입|협력|협업|업무|파트너|MOU|협약|계약|전환|고객|산업|공공|제조|금융|AX/i,
  // ranking among the AX items (build.mjs): an adoption, a deal or a rule outranks a product page or an event
  rank: [
    [3, /\b(deploy\w*|roll(s|ed|ing)? out|brings? \S+( \S+)? to (all )?(its )?(employees|customers|workers)|partner(s|ship|ing)?|agreements?|acquir\w*|MOU|memorandum|invest(s|ment|ing)?|customers? (are|is) using|cuts? costs?)\b|도입|협약|업무협약|파트너십|인수|투자|구축|전사|공급 계약/i],
    [3, /\b(Act|regulat\w*|laws?|legislation|guidance|safety institute|executive order|sovereign\w*)\b|법\b|법」|법,|규제|기본법|가이드라인|국무회의|개정안|시행령/i],
    [2, /\b(survey|research shows|report|study|index|data shows)\b|조사|보고서|연구 결과|실태/i],
    [-4, /\b(iPhone|Galaxy|gift|holiday|ads?|advertis\w*|sponsor\w*|webinar|podcast|Author Talks)\b|아이폰|갤럭시|가전|공모전|경진대회|축제|페스타|시상식|사전예약|박람회|체험|요금제/i],
  ],
};

// ---------- IT domains: how an IT consultancy splits the work ----------
// Each official AX announcement (NEWS) is filed under the domains its title and summary talk about — one may fall in
// several. build.mjs counts them per domain over the last 30 days (the "IT 영역별" tab) and the weekly news post can
// group by them.
export const DOMAINS = [
  { id: "erp", name: "ERP·백오피스", about: "재무·회계·구매·공급망·인사",
    re: /\b(ERP|S\/4HANA|Cloud ERP|financ(e|ial) (close|operations|planning)|accounting|procure\w*|spend management|supply chain|human capital|HCM|payroll|Workday|Ariba|Concur|SuccessFactors|back[- ]office)\b|재무|회계|구매 (관리|업무|시스템)|공급망|인사 관리|급여|백오피스|전사적 자원/i },
  { id: "crm", name: "CRM·고객", about: "영업·마케팅·고객 상담",
    re: /\b(CRM|customer (engagement|service|experience|support)|contact cent(er|re)|marketing|sales teams?|Agentforce|Braze|commerce|loyalty)\b|고객 (경험|상담|관리)|마케팅|영업|콜센터/i },
  { id: "cloud", name: "클라우드·인프라", about: "클라우드·데이터센터·칩·주권 AI",
    re: /\b(cloud|data ?cent(er|re)s?|compute|GPUs?|chips?|Trainium|infrastructure|sovereign\w*|AI factor(y|ies))\b|클라우드|데이터센터|인프라|반도체|컴퓨팅/i },
  { id: "data", name: "데이터·분석", about: "데이터 플랫폼·분석·거버넌스",
    re: /\b(data (platform|cloud|governance|foundation|modernization|management|strategy)|analytics|lakehouse|warehouse|business intelligence|semantic layer|databases?)\b|데이터 (플랫폼|분석|관리|거버넌스|산업)|빅데이터/i },
  { id: "work", name: "업무 도구", about: "전 직원이 쓰는 AI 도구·협업",
    re: /\b(Copilot|ChatGPT (Work|Enterprise|Business|Edu)|Gemini Enterprise|Workspace|all employees|employees|productivity|workforce|ways of working)\b|전 직원|업무 도구|협업|생산성|일하는 방식/i },
  { id: "security", name: "보안·규제", about: "AI 보안·안전·법·규제",
    re: /\b(security|safety|cyber\w*|regulat\w*|AI Act|compliance|privacy|guardrails?|sovereignty)\b|보안|안전|규제|법안|기본법|개인정보|가이드라인/i },
  { id: "agents", name: "AI 에이전트", about: "스스로 일하는 AI·업무 자동화",
    re: /\b(agents?|agentic|autonomous|automat\w*|orchestrat\w*)\b|에이전트|자동화|자율/i },
];
