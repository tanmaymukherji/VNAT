const GRE_API_KEY = 'gre_Qkk63gXGGvN2JiVuzZHMAoTq';
const GRE_API_URL = import.meta.env.DEV ? '/api/askgre' : 'https://askgre.grameee.org/api/chat';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function getGroqKey() {
  return localStorage.getItem('groq_api_key') || '';
}

export async function generateKeywords(needText) {
  const key = getGroqKey();
  if (!key) throw new Error('Groq API key not found. Set it in Settings.');

  const prompt = `Extract 3-5 search keywords from this village need statement. Return ONLY a comma-separated list of keywords, nothing else. Focus on: the problem domain (e.g., water, agriculture, health), the specific issue (e.g., shortage, erosion, lack), and the context (e.g., rural, village, farming).

Need statement: "${needText}"`;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You extract search keywords from village need statements. Return only a comma-separated list.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 100,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Groq API error: ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const keywords = content.split(',').map(k => k.trim()).filter(Boolean);
  return keywords.length > 0 ? keywords : [needText.slice(0, 80)];
}

export async function getSolutionsForNeed(needText, state) {
  try {
    const body = { message: needText };
    if (state) {
      body.filters = { geography: state };
    }
    const response = await fetch(GRE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GRE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`GRE API error: ${response.status}`);
    }

    const data = await response.json();
    const rawSolutions = data.results || data.solutions || [];

    const solutions = rawSolutions.map(s => ({
      offering_name: s.offering_name || 'Solution',
      gre_link: s.gre_link || '#',
      matchScore: s.matchScore || 0,
      offering_category: s.offering_category || '',
      provider: s.solution?.trader?.organisation_name || s.solution?.trader?.trader_name || '',
      domain_6m: s.domain_6m || '',
      geographies_raw: s.geographies_raw || '',
      geographies: Array.isArray(s.geographies) ? s.geographies : [],
    }));

    return {
      solutions,
      interpreted: data.interpreted || null,
      answer: data.answer || '',
      sentText: needText,
    };
  } catch (e) {
    console.error('AskGRE API error:', e);
    return { solutions: [], interpreted: null, answer: '', sentText: needText };
  }
}