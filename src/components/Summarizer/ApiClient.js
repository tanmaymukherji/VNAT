import CONFIG from '../../config';

const SYSTEM_PROMPT_EN = `You are an expert at analyzing village planning LCA (Local Context Assessment) documents in Hindi and English.
Extract structured information and return ONLY valid JSON — no explanation, no markdown, just the JSON object.

Return exactly this JSON structure:
{
  "village_name": "string",
  "district_state": "string",
  "state": "string (only the state name, derive it from the document — e.g., 'Chhattisgarh', 'Uttar Pradesh')",
  "population": "string",
  "context": "2-3 paragraph summary of the village context, challenges, climate risks, and baseline conditions in English",
  "needs": [
    {
      "need": "brief specific need in 1-2 sentences",
      "category": "Water & Sanitation | Education | Healthcare | Roads & Infrastructure | Electricity | Agriculture | Livelihood | Environment | Social Welfare | Other",
      "priority": "High | Medium | Low",
      "source": "document name or section this came from",
      "suggested_action": "string",
      "timeline": "string",
      "responsible_party": "string",
      "budget_estimate": "string",
      "status": "Identified",
      "remarks": "string"
    }
  ],
  "key_findings": ["string"],
  "languages_detected": ["English", "Hindi"]
}

Rules:
- Extract ALL needs found in the document — do not limit or skip any
- Needs come from: the IMPACT column of LCA tables, bullet points about problems/challenges, sentences describing community requirements or gaps
- Priority High if: urgent, critical, immediate, emergency, top priority, severe, shortage
- Priority Low if: long term, future, eventual, gradual, minor
- Categories must match exactly one of: Water & Sanitation, Education, Healthcare, Roads & Infrastructure, Electricity, Agriculture, Livelihood, Environment, Social Welfare, Other
- If Hindi text appears in the document, include it verbatim in need/remarks fields
- context should be 2-3 paragraphs summarizing village profile, climate risks, infrastructure status, and livelihoods
- state field: extract ONLY the state name from the document. If the document mentions a district but not the state, infer the state from the district name. If you cannot determine the state, leave it empty.`;

const SYSTEM_PROMPT_HI = `You are an expert at analyzing village planning LCA (Local Context Assessment) documents in Hindi and English.
Extract structured information and return ONLY valid JSON — no explanation, no markdown, just the JSON object.

Return exactly this JSON structure:
{
  "village_name": "string",
  "district_state": "string",
  "state": "string (only the state name, derive it from the document — e.g., 'छत्तीसगढ़', 'उत्तर प्रदेश')",
  "population": "string",
  "context": "2-3 paragraphs summary of the village context, challenges, climate risks, and baseline conditions in Hindi",
  "needs": [
    {
      "need": "brief specific need in 1-2 sentences",
      "category": "Water & Sanitation | Education | Healthcare | Roads & Infrastructure | Electricity | Agriculture | Livelihood | Environment | Social Welfare | Other",
      "priority": "High | Medium | Low",
      "source": "document name or section this came from",
      "suggested_action": "string",
      "timeline": "string",
      "responsible_party": "string",
      "budget_estimate": "string",
      "status": "Identified",
      "remarks": "string"
    }
  ],
  "key_findings": ["string"],
  "languages_detected": ["English", "Hindi"]
}

Rules:
- Extract ALL needs found in the document — do not limit or skip any
- Priority High if: urgent, critical, immediate, emergency, top priority, severe, shortage
- Priority Low if: long term, future, eventual, gradual, minor
- Categories must match exactly one of: Water & Sanitation, Education, Healthcare, Roads & Infrastructure, Electricity, Agriculture, Livelihood, Environment, Social Welfare, Other
- If English text appears in the document, include it verbatim in need/remarks fields
- context should be 2-3 paragraphs in Hindi summarizing village profile, climate risks, infrastructure status, and livelihoods
- state field: extract ONLY the state name from the document. If the document mentions a district but not the state, infer the state from the district name. If you cannot determine the state, leave it empty.`;

function parseAIResponse(content) {
  let jsonStr = content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];
  try {
    return JSON.parse(jsonStr);
  } catch {
    const altMatch = content.match(/"needs"\s*:\s*\[[\s\S]*?\]\s*,/);
    if (altMatch) {
      try {
        const partial = '{' + altMatch[0] + '}';
        return JSON.parse(partial);
      } catch {}
    }
    throw new Error('JSON parse failed. Raw: ' + content.slice(0, 200));
  }
}

function getKey(provider) {
  if (provider === 'groq') return localStorage.getItem('groq_api_key') || '';
  if (provider === 'nvidia') return localStorage.getItem('nvidia_api_key') || '';
  if (provider === 'hf') return localStorage.getItem('hf_summarise_api_key') || localStorage.getItem('hf_api_key') || '';
  return '';
}

async function callAPI(provider, text, modelId, systemPrompt) {
  const key = getKey(provider);
  if (!key) throw new Error(`No API key for ${provider}`);

  let url, body;
  const truncated = text.length > 12000 ? text.slice(0, 12000) + '\n\n[Document truncated - showing first 12000 characters]' : text;

  if (provider === 'groq') {
    url = 'https://api.groq.com/openai/v1/chat/completions';
    modelId = modelId || 'llama-3.3-70b-versatile';
    body = JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Analyze this village planning document and extract structured data:\n\n' + truncated }
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });
  } else if (provider === 'nvidia') {
    url = 'https://integrate.api.nvidia.com/v1/chat/completions';
    modelId = modelId || 'meta/llama-3.1-8b-instruct';
    body = JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Analyze this village planning document and extract structured data:\n\n' + truncated }
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });
  } else {
    url = 'https://router.huggingface.co/v1/chat/completions';
    modelId = modelId || 'meta-llama/llama-3.1-8b-instruct';
    body = JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Analyze this village planning document and extract structured data:\n\n' + truncated }
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`API ${response.status}: ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content;
}

export async function summarizeReport(text, currentLang = 'en', onLog) {
  const systemPrompt = currentLang === 'hi' ? SYSTEM_PROMPT_HI : SYSTEM_PROMPT_EN;
  const useHFallback = localStorage.getItem('vna_use_hf_fallback') !== 'false';
  let lastError = null;

  const providers = [];
  const groqKey = localStorage.getItem('groq_api_key') || '';
  const nvidiaKey = localStorage.getItem('nvidia_api_key') || '';
  const hfKey = localStorage.getItem('hf_api_key') || '';

  if (groqKey) providers.push({ type: 'groq', key: groqKey });
  if (hfKey) providers.push({ type: 'hf', key: hfKey });
  if (nvidiaKey) providers.push({ type: 'nvidia', key: nvidiaKey });

  for (const p of providers) {
    const label = p.type.toUpperCase();
    onLog?.(`Trying ${label} API...`, 'info');
    try {
      const raw = await callAPI(p.type, text, null, systemPrompt);
      const result = parseAIResponse(raw);
      onLog?.(`${label} API success`, 'success');
      return { success: true, data: result, usedProvider: p.type };
    } catch (e) {
      lastError = e;
      onLog?.(`${label} failed: ${e.message}`, 'warn');
      if (p.type === 'groq' && useHFallback && hfKey) {
        onLog?.('Trying HuggingFace fallback...', 'info');
        try {
          const raw = await callAPI('hf', text, null, systemPrompt);
          const result = parseAIResponse(raw);
          onLog?.('HuggingFace API success', 'success');
          return { success: true, data: result, usedProvider: 'hf' };
        } catch (e2) {
          lastError = e2;
          onLog?.('HuggingFace failed: ' + e2.message, 'warn');
        }
      }
    }
  }

  return { success: false, error: lastError?.message || 'All APIs failed', usedProvider: null };
}