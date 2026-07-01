import React, { useState, useCallback, useRef, useEffect } from 'react';
import { utils, write } from 'xlsx';
import { saveAs } from 'file-saver';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ASKGRE_URL = import.meta.env.DEV ? '/api/askgre' : 'https://askgre.grameee.org/api/chat';
const KEYWORD_MODEL = 'llama-3.3-70b-versatile';

async function groqFetch(prompt, maxTokens = 300) {
  const key = localStorage.getItem('groq_api_key');
  if (!key) throw new Error('No Groq API key. Add it in Settings.');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: KEYWORD_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq API error: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function extractKeywords(needText) {
  const prompt = `You are an expert at extracting search keywords from village need statements.
Given a need statement, extract 3-6 specific, diverse search keywords that would help find matching solutions from a livelihood/development solutions database.
Return ONLY a comma-separated list of keywords — no explanation, no quotes, no formatting.
If the need has multiple distinct topics, extract keywords for each topic separately.

Need statement: "${needText}"

Keywords:`;
  return groqFetch(prompt, 100);
}

async function groupKeywords(keywordsCsv) {
  const prompt = `Analyze the following comma-separated keywords and group them into distinct topic categories.
For each group, provide a concise category name and the list of relevant keywords from the input.
Return ONLY a valid JSON array, no other text:
[
  {"category": "Short Category Name", "keywords": ["keyword1", "keyword2"]},
  {"category": "Another Category", "keywords": ["keyword3", "keyword4"]}
]

If all keywords belong to one topic, return a single group.
Each keyword must appear in exactly one group.

Keywords: ${keywordsCsv}`;
  const raw = await groqFetch(prompt, 400);
  try {
    return JSON.parse(raw);
  } catch {
    return [{ category: 'General', keywords: keywordsCsv.split(',').map(k => k.trim()).filter(Boolean) }];
  }
}

async function searchAskGRE(query, state) {
  const key = localStorage.getItem('gre_api_key');
  if (!key) throw new Error('No AskGRE API key. Add it in Settings.');
  const body = { message: query };
  body.filters = { geography: state || '' };
  const res = await fetch(ASKGRE_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AskGRE API error: ${res.status}`);
  const data = await res.json();
  return data.results || data.solutions || [];
}

function priorityClass(priority) {
  if (!priority) return '';
  const p = priority.toLowerCase();
  if (p === 'high') return 'text-red-600 font-semibold';
  if (p === 'medium') return 'text-amber-600 font-semibold';
  if (p === 'low') return 'text-green-600 font-semibold';
  return '';
}

export default function SolutionsTab({ result, onResultUpdate, onLog, currentLang }) {
  const resultRef = useRef(result);
  useEffect(() => { resultRef.current = result; }, [result]);

  const DISTRICT_TO_STATE = {
    'adilabad': 'Telangana', 'agra': 'Uttar Pradesh', 'ahmedabad': 'Gujarat', 'ahmednagar': 'Maharashtra',
    'aizawl': 'Mizoram', 'ajmer': 'Rajasthan', 'akola': 'Maharashtra', 'alappuzha': 'Kerala',
    'aligarh': 'Uttar Pradesh', 'allahabad': 'Uttar Pradesh', 'almora': 'Uttarakhand', 'alwar': 'Rajasthan',
    'ambala': 'Haryana', 'amravati': 'Maharashtra', 'amreli': 'Gujarat', 'amritsar': 'Punjab',
    'anand': 'Gujarat', 'anantapur': 'Andhra Pradesh', 'anantnag': 'Jammu and Kashmir', 'angul': 'Odisha',
    'anuppur': 'Madhya Pradesh', 'arcot': 'Tamil Nadu', 'ariyalur': 'Tamil Nadu', 'arwal': 'Bihar',
    'ashoknagar': 'Madhya Pradesh', 'auraiya': 'Uttar Pradesh', 'aurangabad': 'Maharashtra',
    'avadi': 'Tamil Nadu', 'azamgarh': 'Uttar Pradesh', 'badgam': 'Jammu and Kashmir', 'bagalkot': 'Karnataka',
    'baghpat': 'Uttar Pradesh', 'bahraich': 'Uttar Pradesh', 'balaghat': 'Madhya Pradesh', 'balangir': 'Odisha',
    'balasore': 'Odisha', 'ballia': 'Uttar Pradesh', 'baltal': 'Jammu and Kashmir', 'banaskantha': 'Gujarat',
    'banda': 'Uttar Pradesh', 'bandipora': 'Jammu and Kashmir', 'bangalore': 'Karnataka', 'bangalore rural': 'Karnataka',
    'bangalore urban': 'Karnataka', 'bankura': 'West Bengal', 'banswara': 'Rajasthan', 'barabanki': 'Uttar Pradesh',
    'baramulla': 'Jammu and Kashmir', 'baran': 'Rajasthan', 'bardhaman': 'West Bengal', 'bareilly': 'Uttar Pradesh',
    'barmer': 'Rajasthan', 'barnala': 'Punjab', 'barpeta': 'Assam', 'bastar': 'Chhattisgarh',
    'basti': 'Uttar Pradesh', 'bathinda': 'Punjab', 'begusarai': 'Bihar', 'belgaum': 'Karnataka',
    'bellary': 'Karnataka', 'betul': 'Madhya Pradesh', 'bhadohi': 'Uttar Pradesh', 'bhadrak': 'Odisha',
    'bhagalpur': 'Bihar', 'bhandara': 'Maharashtra', 'bharatpur': 'Rajasthan', 'bharuch': 'Gujarat',
    'bhavnagar': 'Gujarat', 'bhilwara': 'Rajasthan', 'bhiwandi': 'Maharashtra', 'bhiwani': 'Haryana',
    'bhojpur': 'Bihar', 'bhopal': 'Madhya Pradesh', 'bidar': 'Karnataka', 'bijapur': 'Karnataka',
    'bijnor': 'Uttar Pradesh', 'bikaner': 'Rajasthan', 'bilaspur': 'Chhattisgarh', 'birbhum': 'West Bengal',
    'bishnupur': 'Manipur', 'bokaro': 'Jharkhand', 'bongaigaon': 'Assam', 'bulandshahr': 'Uttar Pradesh',
    'buldhana': 'Maharashtra', 'bundi': 'Rajasthan', 'burhanpur': 'Madhya Pradesh', 'buxar': 'Bihar',
    'calicut': 'Kerala', 'chamarajanagar': 'Karnataka', 'chamba': 'Himachal Pradesh', 'chamoli': 'Uttarakhand',
    'champawat': 'Uttarakhand', 'champhai': 'Mizoram', 'chandauli': 'Uttar Pradesh', 'chandigarh': 'Chandigarh',
    'chandrapur': 'Maharashtra', 'changlang': 'Arunachal Pradesh', 'charkhi dadri': 'Haryana', 'chennai': 'Tamil Nadu',
    'chhapra': 'Bihar', 'chhatarpur': 'Madhya Pradesh', 'chhindwara': 'Madhya Pradesh', 'chikkaballapur': 'Karnataka',
    'chikkamagaluru': 'Karnataka', 'chirang': 'Assam', 'chitradurga': 'Karnataka', 'chitrakoot': 'Uttar Pradesh',
    'chittoor': 'Andhra Pradesh', 'chittorgarh': 'Rajasthan', 'churachandpur': 'Manipur', 'churu': 'Rajasthan',
    'coimbatore': 'Tamil Nadu', 'cooch behar': 'West Bengal', 'cuddalore': 'Tamil Nadu', 'cuttack': 'Odisha',
    'dadra and nagar haveli': 'Dadra and Nagar Haveli', 'dahod': 'Gujarat', 'dakshin bastar': 'Chhattisgarh',
    'dakshina kannada': 'Karnataka', 'daman': 'Daman and Diu', 'damoh': 'Madhya Pradesh', 'darbhanga': 'Bihar',
    'darjeeling': 'West Bengal', 'darrang': 'Assam', 'dausa': 'Rajasthan', 'davangere': 'Karnataka',
    'dehradun': 'Uttarakhand', 'deoghar': 'Jharkhand', 'deoria': 'Uttar Pradesh', 'devbhumi dwarka': 'Gujarat',
    'dhalai': 'Tripura', 'dhamtari': 'Chhattisgarh', 'dhanbad': 'Jharkhand', 'dhar': 'Madhya Pradesh',
    'dharamshala': 'Himachal Pradesh', 'dharwad': 'Karnataka', 'dhasan': 'Madhya Pradesh', 'dhenkanal': 'Odisha',
    'dholpur': 'Rajasthan', 'dibang valley': 'Arunachal Pradesh', 'dibrugarh': 'Assam', 'dima hasao': 'Assam',
    'dimapur': 'Nagaland', 'dingh': 'Gujarat', 'dindigul': 'Tamil Nadu', 'dindori': 'Madhya Pradesh',
    'diu': 'Daman and Diu', 'doda': 'Jammu and Kashmir', 'dumka': 'Jharkhand', 'dungarpur': 'Rajasthan',
    'durg': 'Chhattisgarh', 'durgapur': 'West Bengal', 'dwarka': 'Gujarat', 'east champaran': 'Bihar',
    'east delhi': 'Delhi', 'east garo hills': 'Meghalaya', 'east khasi hills': 'Meghalaya', 'east siang': 'Arunachal Pradesh',
    'east godavari': 'Andhra Pradesh', 'east nimar': 'Madhya Pradesh', 'erode': 'Tamil Nadu', 'etah': 'Uttar Pradesh',
    'etawah': 'Uttar Pradesh', 'faizabad': 'Uttar Pradesh', 'faridabad': 'Haryana', 'faridkot': 'Punjab',
    'farrukhabad': 'Uttar Pradesh', 'fatehabad': 'Haryana', 'fatehgarh sahib': 'Punjab', 'fatehpur': 'Uttar Pradesh',
    'fazilka': 'Punjab', 'firozabad': 'Uttar Pradesh', 'firozpur': 'Punjab', 'gadag': 'Karnataka',
    'gadchiroli': 'Maharashtra', 'gajapati': 'Odisha', 'ganderbal': 'Jammu and Kashmir', 'gandhinagar': 'Gujarat',
    'ganganagar': 'Rajasthan', 'garbeta': 'West Bengal', 'gardar': 'Gujarat', 'garhwa': 'Jharkhand',
    'gautam buddh nagar': 'Uttar Pradesh', 'gaya': 'Bihar', 'ghaziabad': 'Uttar Pradesh', 'ghazipur': 'Uttar Pradesh',
    'giridih': 'Jharkhand', 'gir somnath': 'Gujarat', 'goalpara': 'Assam', 'gokak': 'Karnataka',
    'golaghat': 'Assam', 'gonda': 'Uttar Pradesh', 'gondia': 'Maharashtra', 'gopalganj': 'Bihar',
    'gorakhpur': 'Uttar Pradesh', 'gulbarga': 'Karnataka', 'gumla': 'Jharkhand', 'guna': 'Madhya Pradesh',
    'guntur': 'Andhra Pradesh', 'gurdaspur': 'Punjab', 'gurgaon': 'Haryana', 'guwahati': 'Assam',
    'gwalior': 'Madhya Pradesh', 'hailakandi': 'Assam', 'hamirpur': 'Himachal Pradesh', 'hamirpur up': 'Uttar Pradesh',
    'hanumangarh': 'Rajasthan', 'haora': 'West Bengal', 'hapur': 'Uttar Pradesh', 'harda': 'Madhya Pradesh',
    'hardoi': 'Uttar Pradesh', 'haridwar': 'Uttarakhand', 'hassan': 'Karnataka', 'hathras': 'Uttar Pradesh',
    'haveri': 'Karnataka', 'hazaribagh': 'Jharkhand', 'hilsa': 'Bihar', 'hisar': 'Haryana',
    'hooghly': 'West Bengal', 'hoshangabad': 'Madhya Pradesh', 'hoshiarpur': 'Punjab', 'howrah': 'West Bengal',
    'hubli': 'Karnataka', 'hugli': 'West Bengal', 'hyderabad': 'Telangana', 'idukki': 'Kerala',
    'imphal east': 'Manipur', 'imphal west': 'Manipur', 'indore': 'Madhya Pradesh',
    'i nirmal': 'Telangana', 'iradatganj': 'Uttar Pradesh', 'islampur': 'West Bengal', 'itahari': 'Bihar',
    'itarsi': 'Madhya Pradesh', 'izatnagar': 'Uttar Pradesh', 'jabalpur': 'Madhya Pradesh', 'jagatsinghpur': 'Odisha',
    'jaintia hills': 'Meghalaya', 'jaipur': 'Rajasthan', 'jaisalmer': 'Rajasthan', 'jajpur': 'Odisha',
    'jalandhar': 'Punjab', 'jalaun': 'Uttar Pradesh', 'jalgaon': 'Maharashtra', 'jalna': 'Maharashtra',
    'jalor': 'Rajasthan', 'jalpaiguri': 'West Bengal', 'jammu': 'Jammu and Kashmir', 'jamnagar': 'Gujarat',
    'jamshedpur': 'Jharkhand', 'jamtara': 'Jharkhand', 'jaunpur': 'Uttar Pradesh', 'jayashankar bhupalapally': 'Telangana',
    'jehanabad': 'Bihar', 'jhabua': 'Madhya Pradesh', 'jhajjar': 'Haryana', 'jhalawar': 'Rajasthan',
    'jhansi': 'Uttar Pradesh', 'jharsuguda': 'Odisha', 'jhunjhunu': 'Rajasthan', 'jind': 'Haryana',
    'jodhpur': 'Rajasthan', 'jogulamba gadwal': 'Telangana', 'jorhat': 'Assam', 'junagadh': 'Gujarat',
    'kabal': 'Jammu and Kashmir', 'kabeerdham': 'Chhattisgarh', 'kachchh': 'Gujarat', 'kaimur': 'Bihar',
    'kaithal': 'Haryana', 'kalahandi': 'Odisha', 'kalamassery': 'Kerala', 'kalburgi': 'Karnataka',
    'kaliabor': 'Assam', 'kalka': 'Haryana', 'kalyan': 'Maharashtra', 'kamaraj': 'Tamil Nadu',
    'kamarhati': 'West Bengal', 'kamba': 'Assam', 'kamen': 'Arunachal Pradesh', 'kamisetti': 'Andhra Pradesh',
    'kampa': 'Karnataka', 'kanker': 'Chhattisgarh', 'kannauj': 'Uttar Pradesh', 'kannur': 'Kerala',
    'kanpur dehat': 'Uttar Pradesh', 'kanpur nagar': 'Uttar Pradesh', 'kanshiram nagar': 'Uttar Pradesh',
    'kapurthala': 'Punjab', 'karaikal': 'Puducherry', 'karamadai': 'Tamil Nadu', 'karambakuda': 'Odisha',
    'karawal nagar': 'Delhi', 'karbi anglong': 'Assam', 'kargil': 'Ladakh', 'karimganj': 'Assam',
    'karimnagar': 'Telangana', 'karnal': 'Haryana', 'karur': 'Tamil Nadu', 'kasaragod': 'Kerala',
    'kashmir': 'Jammu and Kashmir', 'kasganj': 'Uttar Pradesh', 'kathua': 'Jammu and Kashmir',
    'katihar': 'Bihar', 'katni': 'Madhya Pradesh', 'kaushambi': 'Uttar Pradesh', 'kavali': 'Andhra Pradesh',
    'kaveri': 'Tamil Nadu', 'kendrapara': 'Odisha', 'kendujhar': 'Odisha', 'kershaping': 'Meghalaya',
    'keonjhar': 'Odisha', 'khadakwasla': 'Maharashtra', 'khagaria': 'Bihar', 'khammam': 'Telangana',
    'khandwa': 'Madhya Pradesh', 'khargone': 'Madhya Pradesh', 'kharipur': 'Uttar Pradesh', 'kheda': 'Gujarat',
    'kheri': 'Uttar Pradesh', 'khetri': 'Rajasthan', 'khowai': 'Tripura', 'khurda': 'Odisha',
    'kibithu': 'Arunachal Pradesh', 'kichha': 'Uttarakhand', 'kinnar': 'Himachal Pradesh', 'kinnaur': 'Himachal Pradesh',
    'kishanganj': 'Bihar', 'kishtwar': 'Jammu and Kashmir', 'kochi': 'Kerala', 'kodagu': 'Karnataka',
    'koderma': 'Jharkhand', 'kohima': 'Nagaland', 'kokrajhar': 'Assam', 'kolar': 'Karnataka',
    'kolhapur': 'Maharashtra', 'kolkata': 'West Bengal', 'kollam': 'Kerala', 'komaram bheem': 'Telangana',
    'konnagar': 'West Bengal', 'kooch behar': 'West Bengal', 'kophar': 'Uttar Pradesh', 'koraput': 'Odisha',
    'korba': 'Chhattisgarh', 'koriya': 'Chhattisgarh', 'kota': 'Rajasthan', 'kotdwara': 'Uttarakhand',
    'kothamangalam': 'Kerala', 'kothagudem': 'Telangana', 'kottayam': 'Kerala', 'kovilpatti': 'Tamil Nadu',
    'krishna': 'Andhra Pradesh', 'kulgam': 'Jammu and Kashmir', 'kullu': 'Himachal Pradesh', 'kulpi': 'West Bengal',
    'kumarghat': 'Tripura', 'kumbakonam': 'Tamil Nadu', 'kupwara': 'Jammu and Kashmir', 'kurnool': 'Andhra Pradesh',
    'kurung kumey': 'Arunachal Pradesh', 'kushi nagar': 'Uttar Pradesh', 'kutch': 'Gujarat', 'lahaul and spiti': 'Himachal Pradesh',
    'lakhimpur': 'Assam', 'lakhimpur kheri': 'Uttar Pradesh', 'lakhisarai': 'Bihar', 'lalganj': 'Bihar',
    'lalitpur': 'Uttar Pradesh', 'latehar': 'Jharkhand', 'latur': 'Maharashtra', 'lawngtlai': 'Mizoram',
    'leh': 'Ladakh', 'lekang': 'Arunachal Pradesh', 'lion': 'Arunachal Pradesh', 'lohardaga': 'Jharkhand',
    'lohit': 'Arunachal Pradesh', 'longding': 'Arunachal Pradesh', 'lower dibang valley': 'Arunachal Pradesh',
    'lower siang': 'Arunachal Pradesh', 'lower subansiri': 'Arunachal Pradesh', 'lucknow': 'Uttar Pradesh',
    'ludhiana': 'Punjab', 'lunglei': 'Mizoram', 'machilipatnam': 'Andhra Pradesh', 'madhepura': 'Bihar',
    'madhubani': 'Bihar', 'madurai': 'Tamil Nadu', 'mahabubabad': 'Telangana', 'mahabubnagar': 'Telangana',
    'mahad': 'Maharashtra', 'maham': 'Haryana', 'maharashtra': 'Maharashtra', 'mahbubnagar': 'Telangana',
    'mahe': 'Puducherry', 'mahendragarh': 'Haryana', 'mahisagar': 'Gujarat', 'mahoba': 'Uttar Pradesh',
    'mainpuri': 'Uttar Pradesh', 'majuli': 'Assam', 'malappuram': 'Kerala', 'malda': 'West Bengal',
    'malkangiri': 'Odisha', 'mamit': 'Mizoram', 'manali': 'Himachal Pradesh', 'manawar': 'Madhya Pradesh',
    'mandawar': 'Rajasthan', 'mandi': 'Himachal Pradesh', 'mandla': 'Madhya Pradesh', 'mandsaur': 'Madhya Pradesh',
    'mandya': 'Karnataka', 'mangan': 'Sikkim', 'mangalagiri': 'Andhra Pradesh', 'mangalore': 'Karnataka',
    'mangaldoi': 'Assam', 'mangaluru': 'Karnataka', 'manjeri': 'Kerala', 'mankapur': 'Uttar Pradesh',
    'manohar thali': 'Uttarakhand', 'marigaon': 'Assam', 'markapur': 'Andhra Pradesh', 'mathura': 'Uttar Pradesh',
    'mau': 'Uttar Pradesh', 'mauritius': 'India', 'mayabunder': 'Andaman and Nicobar', 'mayiladuthurai': 'Tamil Nadu',
    'mayurbhanj': 'Odisha', 'medak': 'Telangana', 'medchal': 'Telangana', 'meerut': 'Uttar Pradesh',
    'meghalaya': 'Meghalaya', 'mehsana': 'Gujarat', 'melur': 'Tamil Nadu', 'mendu': 'Uttar Pradesh',
    'merta': 'Rajasthan', 'mewat': 'Haryana', 'miao': 'Arunachal Pradesh', 'michar': 'Assam',
    'midnapore': 'West Bengal', 'mikir': 'Assam', 'mira bhaindar': 'Maharashtra', 'mirzapur': 'Uttar Pradesh',
    'moga': 'Punjab', 'mohali': 'Punjab', 'mokokchung': 'Nagaland', 'mon': 'Nagaland',
    'moradabad': 'Uttar Pradesh', 'morbi': 'Gujarat', 'morena': 'Madhya Pradesh', 'mori': 'Himachal Pradesh',
    'morni hills': 'Haryana', 'morshi': 'Maharashtra', 'motihari': 'Bihar', 'motilal': 'Uttar Pradesh',
    'motu': 'Odisha', 'muktsar': 'Punjab', 'mumbai': 'Maharashtra', 'mumbai city': 'Maharashtra',
    'mumbai suburban': 'Maharashtra', 'munger': 'Bihar', 'munsiyari': 'Uttarakhand', 'murcia': 'India',
    'murshidabad': 'West Bengal', 'murugan': 'Tamil Nadu', 'muzaffarnagar': 'Uttar Pradesh', 'muzaffarpur': 'Bihar',
    'mysore': 'Karnataka', 'mysuru': 'Karnataka', 'nabadwip': 'West Bengal', 'nabha': 'Punjab',
    'nadia': 'West Bengal', 'nagamangala': 'Karnataka', 'nagaon': 'Assam', 'nagapattinam': 'Tamil Nadu',
    'nagar': 'Rajasthan', 'nagar kurnool': 'Telangana', 'nagarcoil': 'Tamil Nadu', 'nagaur': 'Rajasthan',
    'nagda': 'Madhya Pradesh', 'nagger': 'Himachal Pradesh', 'nagpur': 'Maharashtra', 'nagrakata': 'West Bengal',
    'nahan': 'Himachal Pradesh', 'naharkatiya': 'Assam', 'naharlagun': 'Arunachal Pradesh', 'nainital': 'Uttarakhand',
    'najibabad': 'Uttar Pradesh', 'nalanda': 'Bihar', 'nalbari': 'Assam', 'nalgonda': 'Telangana',
    'namakkal': 'Tamil Nadu', 'namsai': 'Arunachal Pradesh', 'namchi': 'Sikkim', 'nanak': 'Punjab',
    'nanded': 'Maharashtra', 'nandikotkur': 'Andhra Pradesh', 'nandyal': 'Andhra Pradesh', 'nangal': 'Punjab',
    'nanpara': 'Uttar Pradesh', 'narasinghapeta': 'Andhra Pradesh', 'narayanpet': 'Telangana', 'narmadapuram': 'Madhya Pradesh',
    'narsinghpur': 'Madhya Pradesh', 'nashik': 'Maharashtra', 'navi mumbai': 'Maharashtra', 'navsari': 'Gujarat',
    'nawada': 'Bihar', 'nawanshahr': 'Punjab', 'nayagarh': 'Odisha', 'nedumkandam': 'Kerala',
    'nehru': 'Delhi', 'nellore': 'Andhra Pradesh', 'new delhi': 'Delhi', 'nilgiris': 'Tamil Nadu',
    'nimapada': 'Odisha', 'nirmal': 'Telangana', 'nirsa': 'Jharkhand', 'nizamabad': 'Telangana',
    'noida': 'Uttar Pradesh', 'noklak': 'Nagaland', 'north 24 parganas': 'West Bengal', 'north delhi': 'Delhi',
    'north east delhi': 'Delhi', 'north goa': 'Goa', 'north sikkim': 'Sikkim', 'north west delhi': 'Delhi',
    'north and middle andaman': 'Andaman and Nicobar', 'notun': 'Assam', 'nuapada': 'Odisha', 'nuh': 'Haryana',
    'nurpur': 'Himachal Pradesh', 'okha': 'Gujarat', 'ongole': 'Andhra Pradesh', 'orai': 'Uttar Pradesh',
    'osmanabad': 'Maharashtra', 'osmangarh': 'Telangana', 'pachmarhi': 'Madhya Pradesh', 'padrauna': 'Uttar Pradesh',
    'pahalgam': 'Jammu and Kashmir', 'palakkad': 'Kerala', 'palamau': 'Jharkhand', 'palampur': 'Himachal Pradesh',
    'palasa': 'Andhra Pradesh', 'pali': 'Rajasthan', 'palitana': 'Gujarat', 'palwal': 'Haryana',
    'panaji': 'Goa', 'panchkula': 'Haryana', 'panchmahal': 'Gujarat', 'pandharkawada': 'Maharashtra',
    'pandharpur': 'Maharashtra', 'panipat': 'Haryana', 'panna': 'Madhya Pradesh', 'panvel': 'Maharashtra',
    'papum pare': 'Arunachal Pradesh', 'parbhani': 'Maharashtra', 'pargi': 'Himachal Pradesh', 'paschim bardhaman': 'West Bengal',
    'paschim medinipur': 'West Bengal', 'pashchim champaran': 'Bihar', 'patan': 'Gujarat', 'patiala': 'Punjab',
    'patna': 'Bihar', 'payyanur': 'Kerala', 'peddapalli': 'Telangana', 'perambalur': 'Tamil Nadu',
    'peren': 'Nagaland', 'peth': 'Maharashtra', 'phagwara': 'Punjab', 'phalodi': 'Rajasthan',
    'phulbani': 'Odisha', 'phulpur': 'Uttar Pradesh', 'piduguralla': 'Andhra Pradesh', 'pilibhit': 'Uttar Pradesh',
    'pimpalgaon': 'Maharashtra', 'pinjore': 'Haryana', 'pithoragarh': 'Uttarakhand', 'piyari': 'Bihar',
    'podili': 'Andhra Pradesh', 'pokhara': 'Uttar Pradesh', 'pollachi': 'Tamil Nadu', 'pondicherry': 'Puducherry',
    'ponduru': 'Andhra Pradesh', 'poonch': 'Jammu and Kashmir', 'porbandar': 'Gujarat', 'port blair': 'Andaman and Nicobar',
    'potta': 'Kerala', 'prakasam': 'Andhra Pradesh', 'pratapgarh': 'Rajasthan', 'pratapgarh up': 'Uttar Pradesh',
    'pudukkottai': 'Tamil Nadu', 'pulgaon': 'Maharashtra', 'pulwama': 'Jammu and Kashmir', 'pune': 'Maharashtra',
    'purba bardhaman': 'West Bengal', 'purba medinipur': 'West Bengal', 'puri': 'Odisha', 'purnia': 'Bihar',
    'purulia': 'West Bengal', 'pushkar': 'Rajasthan', 'raebareli': 'Uttar Pradesh', 'raichur': 'Karnataka',
    'raigarh': 'Chhattisgarh', 'raigad': 'Maharashtra', 'raipur': 'Chhattisgarh', 'raisen': 'Madhya Pradesh',
    'rajahmundry': 'Andhra Pradesh', 'rajanna': 'Telangana', 'rajauri': 'Jammu and Kashmir', 'rajgarh': 'Madhya Pradesh',
    'rajkot': 'Gujarat', 'rajnandgaon': 'Chhattisgarh', 'rajouri': 'Jammu and Kashmir', 'rajsamand': 'Rajasthan',
    'rajura': 'Maharashtra', 'ramabai nagar': 'Uttar Pradesh', 'ramagundam': 'Telangana', 'ramanagara': 'Karnataka',
    'ramanathapuram': 'Tamil Nadu', 'ramban': 'Jammu and Kashmir', 'ramgarh': 'Jharkhand', 'ramnagar': 'Uttarakhand',
    'rampur': 'Uttar Pradesh', 'ranchi': 'Jharkhand', 'rangareddy': 'Telangana', 'rath': 'Uttar Pradesh',
    'ratlam': 'Madhya Pradesh', 'ratnagiri': 'Maharashtra', 'ravi': 'Punjab', 'raxaul': 'Bihar',
    'rayagada': 'Odisha', 'reasi': 'Jammu and Kashmir', 'rewa': 'Madhya Pradesh', 'rewari': 'Haryana',
    'ri bhoi': 'Meghalaya', 'rishikesh': 'Uttarakhand', 'rohtak': 'Haryana', 'rohtas': 'Bihar',
    'roing': 'Arunachal Pradesh', 'ron': 'Karnataka', 'roorkee': 'Uttarakhand', 'roro': 'Himachal Pradesh',
    'rosh': 'Himachal Pradesh', 'rotheras': 'Uttar Pradesh', 'rudraprayag': 'Uttarakhand', 'ruknuddin': 'India',
    'rupnagar': 'Punjab', 'sabarkantha': 'Gujarat', 'sadar': 'Karnataka', 'sadarsi': 'Chhattisgarh',
    'sagar': 'Madhya Pradesh', 'saharanpur': 'Uttar Pradesh', 'saharsa': 'Bihar', 'sahaspur': 'Uttar Pradesh',
    'sahibganj': 'Jharkhand', 'sainthia': 'West Bengal', 'salem': 'Tamil Nadu', 'salsette': 'Maharashtra',
    'samastipur': 'Bihar', 'samba': 'Jammu and Kashmir', 'sambalpur': 'Odisha', 'sambhal': 'Uttar Pradesh',
    'sangareddy': 'Telangana', 'sangli': 'Maharashtra', 'sangrur': 'Punjab', 'sant kabir nagar': 'Uttar Pradesh',
    'sant ravidas nagar': 'Uttar Pradesh', 'saran': 'Bihar', 'saranda': 'Jharkhand', 'sarguja': 'Chhattisgarh',
    'sarupathar': 'Assam', 'sasaram': 'Bihar', 'satara': 'Maharashtra', 'satna': 'Madhya Pradesh',
    'sawai madhopur': 'Rajasthan', 'sehore': 'Madhya Pradesh', 'senapati': 'Manipur', 'seoni': 'Madhya Pradesh',
    'sergarh': 'Odisha', 'serichedi': 'Tamil Nadu', 'seringapatam': 'Karnataka', 'serthala': 'Kerala',
    'sevagram': 'Maharashtra', 'shahada': 'Maharashtra', 'shahdara': 'Delhi', 'shahdol': 'Madhya Pradesh',
    'shahjahanpur': 'Uttar Pradesh', 'shajapur': 'Madhya Pradesh', 'sheikhpura': 'Bihar', 'sheohar': 'Bihar',
    'sheopur': 'Madhya Pradesh', 'shillong': 'Meghalaya', 'shimla': 'Himachal Pradesh', 'shimoga': 'Karnataka',
    'shivamogga': 'Karnataka', 'shivpuri': 'Madhya Pradesh', 'shrawasti': 'Uttar Pradesh', 'shyamli': 'Uttarakhand',
    'sibsagar': 'Assam', 'sidhi': 'Madhya Pradesh', 'sidhpur': 'Gujarat', 'sidhrawali': 'Haryana',
    'sikar': 'Rajasthan', 'sikkim': 'Sikkim', 'silchar': 'Assam', 'siliguri': 'West Bengal',
    'simdega': 'Jharkhand', 'simla': 'Himachal Pradesh', 'sindhudurg': 'Maharashtra', 'sindri': 'Jharkhand',
    'singapore': 'India', 'singhbhum': 'Jharkhand', 'singrauli': 'Madhya Pradesh', 'sini': 'Jharkhand',
    'sipsi': 'West Bengal', 'sirkali': 'Tamil Nadu', 'sirsa': 'Haryana', 'sirsi': 'Karnataka',
    'siru': 'Tamil Nadu', 'sirumalai': 'Tamil Nadu', 'sitamarhi': 'Bihar', 'sitapur': 'Uttar Pradesh',
    'sivaganga': 'Tamil Nadu', 'sivasagar': 'Assam', 'siwan': 'Bihar', 'sohna': 'Haryana',
    'solapur': 'Maharashtra', 'solan': 'Himachal Pradesh', 'som': 'Uttar Pradesh', 'sonbhadra': 'Uttar Pradesh',
    'sonebhadra': 'Uttar Pradesh', 'sonepat': 'Haryana', 'songadh': 'Gujarat', 'sonipat': 'Haryana',
    'sonitpur': 'Assam', 'sorab': 'Karnataka', 'south 24 parganas': 'West Bengal', 'south delhi': 'Delhi',
    'south goa': 'Goa', 'south sikkim': 'Sikkim', 'south west delhi': 'Delhi', 'south andaman': 'Andaman and Nicobar',
    'south garo hills': 'Meghalaya', 'srinagar': 'Jammu and Kashmir', 'srikakulam': 'Andhra Pradesh', 'sriperumbudur': 'Tamil Nadu',
    'srivilliputhur': 'Tamil Nadu', 'subarnapur': 'Odisha', 'sultanpur': 'Uttar Pradesh', 'sundargarh': 'Odisha',
    'supaul': 'Bihar', 'surajpur': 'Chhattisgarh', 'surat': 'Gujarat', 'suratgarh': 'Rajasthan',
    'surgen': 'Chhattisgarh', 'surguja': 'Chhattisgarh', 'surma': 'Tripura', 'susner': 'Madhya Pradesh',
    'swai': 'Rajasthan', 'tadepalligudem': 'Andhra Pradesh', 'tadpatri': 'Andhra Pradesh', 'tamenglong': 'Manipur',
    'tamluk': 'West Bengal', 'tanda': 'Uttar Pradesh', 'tandwa': 'Jharkhand', 'tangla': 'Assam',
    'tapi': 'Gujarat', 'tarn taran': 'Punjab', 'tatanagar': 'Jharkhand', 'tawang': 'Arunachal Pradesh',
    'tehri': 'Uttarakhand', 'teja': 'Punjab', 'teknaf': 'India', 'telangana': 'Telangana',
    'tenali': 'Andhra Pradesh', 'tepur': 'Assam', 'thane': 'Maharashtra', 'thankassery': 'Kerala',
    'thar': 'Rajasthan', 'thathi': 'Uttarakhand', 'theni': 'Tamil Nadu', 'thesis': 'India',
    'thiruvananthapuram': 'Kerala', 'thoothukudi': 'Tamil Nadu', 'thoubal': 'Manipur', 'thrissur': 'Kerala',
    'thuraiyur': 'Tamil Nadu', 'tikamgarh': 'Madhya Pradesh', 'tinsukia': 'Assam', 'tipra': 'Tripura',
    'tirap': 'Arunachal Pradesh', 'tiruchirappalli': 'Tamil Nadu', 'tirunelveli': 'Tamil Nadu', 'tirupati': 'Andhra Pradesh',
    'tiruppur': 'Tamil Nadu', 'tiruvallur': 'Tamil Nadu', 'tiruvannamalai': 'Tamil Nadu', 'tiruvarur': 'Tamil Nadu',
    'toba': 'India', 'tonk': 'Rajasthan', 'tuensang': 'Nagaland', 'tufanganj': 'West Bengal',
    'tuljapur': 'Maharashtra', 'tumkur': 'Karnataka', 'tumakuru': 'Karnataka', 'tuni': 'Andhra Pradesh',
    'tura': 'Meghalaya', 'udagamandalam': 'Tamil Nadu', 'udai': 'Rajasthan', 'udaipur': 'Rajasthan',
    'udalguri': 'Assam', 'udham singh nagar': 'Uttarakhand', 'udhampur': 'Jammu and Kashmir', 'udukkottai': 'Tamil Nadu',
    'uganda': 'India', 'ujjain': 'Madhya Pradesh', 'ukhrul': 'Manipur', 'ulhasnagar': 'Maharashtra',
    'ullal': 'Karnataka', 'ulp': 'India', 'ulundurpettai': 'Tamil Nadu', 'umarkote': 'Odisha',
    'umaria': 'Madhya Pradesh', 'unakoti': 'Tripura', 'unguturu': 'Andhra Pradesh', 'unnao': 'Uttar Pradesh',
    'unter': 'Himachal Pradesh', 'up': 'Uttar Pradesh', 'upper dibang valley': 'Arunachal Pradesh', 'upper siang': 'Arunachal Pradesh',
    'upper subansiri': 'Arunachal Pradesh', 'uttar bastar kanker': 'Chhattisgarh', 'uttar dinajpur': 'West Bengal',
    'uttar kashmir': 'Jammu and Kashmir', 'uttara kannada': 'Karnataka', 'uttarkashi': 'Uttarakhand',
    'vadodara': 'Gujarat', 'vaishali': 'Bihar', 'valmiki': 'Bihar', 'valsad': 'Gujarat',
    'vandavasi': 'Tamil Nadu', 'vapi': 'Gujarat', 'varanasi': 'Uttar Pradesh', 'vellore': 'Tamil Nadu',
    'venkatagiri': 'Andhra Pradesh', 'veraval': 'Gujarat', 'vice': 'India', 'vidisha': 'Madhya Pradesh',
    'vijayapura': 'Karnataka', 'vijayawada': 'Andhra Pradesh', 'villupuram': 'Tamil Nadu', 'vinukonda': 'Andhra Pradesh',
    'virar': 'Maharashtra', 'virudhunagar': 'Tamil Nadu', 'visakhapatnam': 'Andhra Pradesh', 'vizag': 'Andhra Pradesh',
    'vizianagaram': 'Andhra Pradesh', 'vyara': 'Gujarat', 'wadhwan': 'Gujarat', 'wadi': 'Karnataka',
    'wai': 'Maharashtra', 'walajapet': 'Tamil Nadu', 'wanaparthy': 'Telangana', 'warangal': 'Telangana',
    'wardha': 'Maharashtra', 'washim': 'Maharashtra', 'wayanad': 'Kerala', 'west champaran': 'Bihar',
    'west delhi': 'Delhi', 'west garo hills': 'Meghalaya', 'west godavari': 'Andhra Pradesh', 'west karbi anglong': 'Assam',
    'west khasi hills': 'Meghalaya', 'west siang': 'Arunachal Pradesh', 'west sikkim': 'Sikkim', 'west tripura': 'Tripura',
    'wokha': 'Nagaland', 'yadadri': 'Telangana', 'yadgir': 'Karnataka', 'yamuna nagar': 'Haryana',
    'yamunanagar': 'Haryana', 'yanam': 'Puducherry', 'yatnal': 'Karnataka', 'yeola': 'Maharashtra',
    'yerraguntla': 'Andhra Pradesh', 'yezali': 'Arunachal Pradesh', 'zahirabad': 'Telangana', 'zirakpur': 'Punjab',
    'zunheboto': 'Nagaland',
  };

  const villageState = result?.state || (() => {
    const parsed = result?.district_state?.split(',').pop()?.trim() || '';
    if (parsed && DISTRICT_TO_STATE[parsed.toLowerCase()]) return DISTRICT_TO_STATE[parsed.toLowerCase()];
    return parsed;
  })() || '';

  const [needs, setNeeds] = useState(() => {
    if (!result?.needs) return [];
    return result.needs.map((n, i) => ({
      ...n,
      _id: i,
      _keywords: n._keywords || '',
      _keywordGroups: null,
      _generatingKeywords: false,
      _checkingSolutions: false,
      _solutionsExpanded: false,
      _apiError: null,
    }));
  });

  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [limitToState, setLimitToState] = useState(false);

  const handleGenerateKeywords = useCallback(async (idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _generatingKeywords: true, _apiError: null } : n));
    const snapshot = needs;
    const needText = snapshot[idx]?.need;
    if (!needText) return;
    try {
      const keywords = await extractKeywords(needText);
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _keywords: keywords, _generatingKeywords: false } : n));
      onLog?.(`Keywords generated for need #${idx + 1}`, 'success');
    } catch (e) {
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _generatingKeywords: false, _apiError: e.message } : n));
      onLog?.(e.message, 'error');
    }
  }, [needs, onLog]);

  const handleGenerateAll = useCallback(async () => {
    setBulkGenerating(true);
    setProgress(0);
    const snapshot = needs;
    const todo = snapshot.filter(n => !n._keywords);
    if (todo.length === 0) { setBulkGenerating(false); return; }
    let completed = 0;
    for (const need of todo) {
      try {
        const keywords = await extractKeywords(need.need);
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _keywords: keywords, _generatingKeywords: false } : n));
        completed++; setProgress(completed);
        onLog?.(`Keywords generated for need #${need._id + 1}`, 'success');
      } catch (e) {
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _generatingKeywords: false, _apiError: e.message } : n));
        completed++; setProgress(completed);
        onLog?.(e.message, 'error');
      }
    }
    setBulkGenerating(false);
  }, [needs, onLog]);

  const searchGroup = useCallback(async (group, state) => {
    const query = group.category + ': ' + group.keywords.join(', ');
    const solutions = await searchAskGRE(query, state);
    return { ...group, solutions };
  }, []);

  const handleCheckSolutions = useCallback(async (idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _checkingSolutions: true, _apiError: null } : n));
    const snapshot = needs;
    const need = snapshot[idx];
    if (!need?._keywords) return;
    try {
      const groups = await groupKeywords(need._keywords);
      const state = limitToState ? villageState : null;
      const groupedResults = await Promise.all(groups.map(g => searchGroup(g, state)));
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _keywordGroups: groupedResults, _checkingSolutions: false, _solutionsExpanded: false } : n));
      const total = groupedResults.reduce((s, g) => s + (g.solutions || []).length, 0);
      onLog?.(`Found ${total} solutions across ${groupedResults.length} groups for need #${idx + 1}`, 'success');
    } catch (e) {
      setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _checkingSolutions: false, _apiError: e.message } : n));
      onLog?.(e.message, 'error');
    }
  }, [needs, onLog, searchGroup, limitToState, villageState]);

  const handleCheckAll = useCallback(async () => {
    setBulkChecking(true);
    setProgress(0);
    const snapshot = needs;
    const todo = snapshot.filter(n => n._keywords);
    if (todo.length === 0) { setBulkChecking(false); return; }
    const state = limitToState ? villageState : null;
    let completed = 0;
    for (const need of todo) {
      try {
        const groups = await groupKeywords(need._keywords);
        const groupedResults = await Promise.all(groups.map(g => searchGroup(g, state)));
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _keywordGroups: groupedResults, _checkingSolutions: false } : n));
        completed++; setProgress(completed);
        const total = groupedResults.reduce((s, g) => s + (g.solutions || []).length, 0);
        onLog?.(`Found ${total} solutions across ${groupedResults.length} groups for need #${need._id + 1}`, 'success');
      } catch (e) {
        setNeeds(prev => prev.map((n, i) => i === need._id ? { ...n, _checkingSolutions: false, _apiError: e.message } : n));
        completed++; setProgress(completed);
        onLog?.(e.message, 'error');
      }
    }
    setBulkChecking(false);
  }, [needs, onLog, searchGroup, limitToState, villageState]);

  const handleKeywordsChange = useCallback((idx, value) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _keywords: value } : n));
  }, []);

  const toggleSolutions = useCallback((idx) => {
    setNeeds(prev => prev.map((n, i) => i === idx ? { ...n, _solutionsExpanded: !n._solutionsExpanded } : n));
  }, []);

  const handleClearSolutions = useCallback(() => {
    setNeeds(prev => prev.map(n => ({ ...n, _keywordGroups: null, _solutionsExpanded: false })));
  }, []);

  const handleExportXlsx = useCallback(() => {
    const snapshot = needs;
    const cols = ['Need', 'Need Keywords', 'Category', 'Priority', 'Group', 'Provider Name', 'Offering Name', '6M Type', 'Score', 'Offering Link'];
    const rows = [];
    for (const n of snapshot) {
      if (!n._keywordGroups || n._keywordGroups.length === 0) {
        rows.push({ 'Need': n.need, 'Need Keywords': n._keywords, 'Category': n.category, 'Priority': n.priority, 'Group': '', 'Provider Name': '', 'Offering Name': '', '6M Type': '', 'Score': '', 'Offering Link': '' });
      } else {
        for (const g of n._keywordGroups) {
          if (!g.solutions || g.solutions.length === 0) {
            rows.push({ 'Need': n.need, 'Need Keywords': g.keywords.join(', '), 'Category': g.category, 'Priority': n.priority, 'Group': g.category, 'Provider Name': '', 'Offering Name': '', '6M Type': '', 'Score': '', 'Offering Link': '' });
          } else {
            for (const sol of g.solutions) {
              rows.push({
                'Need': n.need, 'Need Keywords': g.keywords.join(', '), 'Category': g.category, 'Priority': n.priority, 'Group': g.category,
                'Provider Name': sol.solution?.trader?.organisation_name || sol.provider_name || '',
                'Offering Name': sol.offering_name || '',
                '6M Type': sol.domain_6m || sol['6m_type'] || '',
                'Score': sol.matchScore ?? sol.relevance_score ?? '',
                'Offering Link': sol.gre_link || sol.offering_link || '',
              });
            }
          }
        }
      }
    }
    const ws = utils.json_to_sheet(rows);
    ws['!cols'] = cols.map(() => ({ wch: 22 }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Solutions');
    const name = (resultRef.current?.village_name || 'solutions').replace(/[\\/:*?"<>|]/g, '_');
    const binStr = write(wb, { bookType: 'xlsx', type: 'binary' });
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i) & 0xFF;
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, name + '_solutions.xlsx');
  }, [needs]);

  const t = (key) => {
    const LABELS = {
      en: { LimitToState: 'Limit to State', Geography: 'Geography' },
      hi: { LimitToState: 'राज्य तक सीमित', Geography: 'भूगोल' },
    };
    return LABELS[currentLang]?.[key] || key;
  };

  if (!result?.needs || result.needs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No needs found. Run Need Analyser first.
      </div>
    );
  }

  const isBusy = bulkGenerating || bulkChecking;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b">
        <h3 className="text-sm font-semibold text-slate-700">Solutions</h3>
        <div className="flex gap-2 items-center">
          <button onClick={handleExportXlsx} className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">Export Solutions</button>
          <button onClick={handleGenerateAll} disabled={isBusy} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {bulkGenerating ? `Generating... (${progress}/${needs.filter(n => !n._keywords).length || 1})` : 'Generate All Keywords'}
          </button>
          <button onClick={handleCheckAll} disabled={isBusy} className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {bulkChecking ? `Checking... (${progress}/${needs.filter(n => n._keywords).length || 1})` : 'Check All Solutions'}
          </button>
          <button onClick={handleClearSolutions} disabled={isBusy} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50">Clear Solutions</button>
          {villageState && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none ml-2">
              <input
                type="checkbox"
                checked={limitToState}
                onChange={e => setLimitToState(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>{t('LimitToState')}: <span className="font-semibold text-slate-700">{villageState}</span></span>
            </label>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Need</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 w-96">Need Keywords</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Category</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Priority</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Potential Solution Stack</th>
            </tr>
          </thead>
          <tbody>
            {needs.map((need, idx) => (
              <tr key={need._id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800 align-top">{need.need}</td>
                <td className="px-3 py-2 align-top">
                  <div className="flex gap-1 items-start">
                    <textarea
                      value={need._keywords}
                      onChange={(e) => handleKeywordsChange(idx, e.target.value)}
                      className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-indigo-400 resize-y min-h-[3.5em]"
                      placeholder="Enter keywords (comma-separated)..."
                      rows={2}
                    />
                    <button
                      onClick={() => handleGenerateKeywords(idx)}
                      disabled={need._generatingKeywords || isBusy}
                      className="shrink-0 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded hover:bg-indigo-200 disabled:opacity-50"
                      title="Generate keywords from need text"
                    >{need._generatingKeywords ? '...' : 'Gen'}</button>
                  </div>
                  {need._apiError && <p className="mt-1 text-red-600">{need._apiError}</p>}
                </td>
                <td className="px-3 py-2 align-top">
                  {need._keywordGroups ? (
                    <div className="flex flex-col gap-1">
                      {need._keywordGroups.map((g, gi) => (
                        <span key={gi} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{g.category}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{need.category || 'Other'}</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <span className={priorityClass(need.priority)}>{need.priority || 'Medium'}</span>
                </td>
                <td className="px-3 py-2 align-top">
                  {!need._keywordGroups && !need._checkingSolutions && (
                    need._keywords ? (
                      <button onClick={() => handleCheckSolutions(idx)} className="text-indigo-600 hover:text-indigo-800 underline">Check Solutions</button>
                    ) : (
                      <span className="text-slate-400">Enter keywords first</span>
                    )
                  )}
                  {need._checkingSolutions && <span className="text-slate-500">Grouping & searching...</span>}
                  {need._keywordGroups && need._keywordGroups.length > 0 && (
                    <div className="space-y-3">
                      {need._keywordGroups.map((g, gi) => (
                        <div key={gi}>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{g.category}</p>
                          {(g.solutions || []).length > 0 ? (
                            <div className="space-y-1">
                              {(need._solutionsExpanded ? g.solutions : g.solutions.slice(0, 5)).map((sol, si) => (
                                <div key={si} className="text-xs border-b border-slate-100 pb-1 last:border-0">
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-[10px] text-slate-400">[{sol.matchScore ?? sol.relevance_score ?? 0}]</span>
                                    {sol.gre_link || sol.offering_link ? (
                                      <a href={sol.gre_link || sol.offering_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline font-medium">{sol.offering_name || 'Solution'}</a>
                                    ) : (
                                      <span className="font-medium text-slate-700">{sol.offering_name || 'Solution'}</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {sol.domain_6m || sol['6m_type'] ? <span>6M: {sol.domain_6m || sol['6m_type']} </span> : ''}
                                    {sol.solution?.trader?.organisation_name || sol.solution?.trader?.trader_name || sol.provider_name ? <span>Provider: {sol.solution?.trader?.organisation_name || sol.solution?.trader?.trader_name || sol.provider_name}</span> : ''}
                                    {sol.geographies_raw && (
                                      <span className="ml-1">| {t('Geography')}: {sol.geographies_raw}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {g.solutions.length > 5 && (
                                <button onClick={() => toggleSolutions(idx)} className="text-indigo-600 hover:text-indigo-800 text-[10px]">
                                  {need._solutionsExpanded ? '▴ Show less' : `▾ +${g.solutions.length - 5} more`}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">No solutions found</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
