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

// Hugging Face: one snapshot per run of the most-downloaded and the trending models.
export const HF = { top: 300, trending: 50 };

// SEC EDGAR XBRL (companyfacts): capital expenditure — cash paid for property and equipment (data centres, servers,
// chips). Cash-flow facts are filed year-to-date, so fetch.mjs derives each quarter by difference; verify.mjs checks
// that four derived quarters add up to the annual 10-K figure. US government data; SEC asks for a User-Agent with contact.
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
