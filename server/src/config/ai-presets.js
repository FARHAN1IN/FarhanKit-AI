/**
 * AI providers the ATS review can use. All speak the OpenAI-compatible chat API.
 * `custom` lets the admin plug in any other OpenAI-compatible service by URL.
 */
export const AI_PRESETS = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    envKey: 'GEMINI_API_KEY',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    envKey: 'GROQ_API_KEY',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    envKey: 'OPENROUTER_API_KEY',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    needsKey: false,
    keyUrl: 'https://ollama.com',
    envKey: null,
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    model: '',
    needsKey: false,
    keyUrl: '',
    envKey: null,
  },
};

export const AI_PROVIDER_TYPES = Object.keys(AI_PRESETS);
