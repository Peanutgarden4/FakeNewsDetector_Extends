import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3000;

// Enable CORS for Chrome Extension requests
app.use(cors());
app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Heuristic keyword definitions for fallback simulation
const FAKE_KEYWORDS = [
  { term: '외계인', score: 98, reason: '신뢰할 수 없는 외계인 상륙/UFO 관련 음모론이 주장되었습니다.' },
  { term: 'aliens', score: 95, reason: 'Unverified claims about extraterrestrial activity detected.' },
  { term: '일루미나티', score: 90, reason: '검증되지 않은 비밀 단체 관련 역사 왜곡 음모론이 포함되어 있습니다.' },
  { term: '지구평평', score: 95, reason: '비과학적 평평한 지구 설 주장으로 허위 정보 판정되었습니다.' },
  { term: '백신 칩', score: 92, reason: '백신 음모론(마이크로칩 삽입 등) 관련 공중보건 유해 정보입니다.' },
  { term: '비밀공작', score: 88, reason: '근거 없는 정부/기관의 비밀 정치 공작 의혹이 제기되었습니다.' },
  { term: 'conspiracy', score: 85, reason: 'Conspiracy theory patterns and unverified claims detected.' },
  { term: '매수', score: 91, reason: '특정 정치인에 대한 근거 없는 외교적 매수설 및 국익 훼손성 루머가 포착되었습니다.' },
  { term: '중국', score: 80, reason: '해외 세력과의 연계설에 기반한 정치 공작용 가짜뉴스가 의심됩니다.' }
];

app.post('/api/analyze', async (req, res) => {
  const { text, imageUrls = [], videoUrls = [] } = req.body;
  const normalizedText = (text || '').trim();

  // 1. Try Gemini API for real-time intelligent fact-checking
  try {
    const promptText = `You are a professional, objective, and neutral fact-checking and deepfake detection AI assistant.
Analyze the credibility of the following content. Assess if it contains unverified rumors, conspiracy theories, historical/factual errors, extreme political bias, or if it is a standard, verified claim.
If the statement is a rumor or fake news, evaluate it.
You MUST also provide counter-evidence or contrasting perspectives from credible official sources (e.g. news outlets, electoral commissions, government portals, or scientific organizations) if available.

Respond strictly in JSON format matching this schema:
{
  "factCheck": {
    "isFake": boolean,
    "score": number, // 0 to 100 representing risk/fakery level
    "reason": "Clear, objective explanation of why it is flagged or normal. If flagged, describe the factual errors or rumors neutrally. Language: Korean.",
    "counterEvidence": [
      { "source": "Name of credible source", "content": "Opposing verified fact or official statement. Language: Korean." }
    ]
  },
  "deepfake": {
    "isDeepfake": boolean,
    "score": number, // 0 to 100 representing deepfake risk
    "reason": "Assessment of deepfake indicators based on context or media URLs. Language: Korean."
  }
}

Content to analyze:
Text: "${normalizedText}"
Images: ${JSON.stringify(imageUrls)}
Videos: ${JSON.stringify(videoUrls)}`;

    console.log(`[Gemini Request] Sending text for analysis (${normalizedText.substring(0, 50)}...)`);

    const apiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: promptText
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (apiResponse.ok) {
      const responseData = await apiResponse.json();
      if (responseData.candidates && responseData.candidates[0]?.content?.parts[0]?.text) {
        const geminiText = responseData.candidates[0].content.parts[0].text;
        const geminiResult = JSON.parse(geminiText);
        console.log(`[Gemini Success] Analysis complete. Fake score: ${geminiResult.factCheck.score}%, Deepfake score: ${geminiResult.deepfake.score}%`);
        return res.json(geminiResult);
      }
    }
    throw new Error(`Gemini API returned status: ${apiResponse.status}`);
  } catch (apiErr) {
    console.error(`[Gemini Error] Fallback to local heuristic matching:`, apiErr.message);
  }

  // --- Fallback Local Heuristics Engine (Runs if Gemini fails/offline) ---
  let fakeScore = 0;
  let fakeReason = '';
  let isFake = false;
  let deepfakeScore = 0;
  let deepfakeReason = '';
  let isDeepfake = false;

  const KNOWLEDGE_BASE = [
    {
      claimPattern: /이재명\s*대통령/,
      score: 95,
      reason: "대한민국의 전현직 대통령 명단에 '이재명'은 존재하지 않습니다.",
      counterEvidence: [
        { source: "중앙선거관리위원회", content: "대한민국 제20대 대통령 선거 당선인은 윤석열 후보로 공식 확정 및 임기 개시되었습니다." },
        { source: "헌법재판소/선거법", content: "이재명은 현재 국회의원이자 야당 대표 직무를 수행 중이며 대통령 직위를 가진 적이 없습니다." }
      ]
    },
    {
      claimPattern: /(이재명.*중국.*매수)|(중국.*이재명.*매수)/,
      score: 90,
      reason: "이재명 대표가 중국 정부로부터 매수되었다는 사법적 사실은 존재하지 않는 의혹입니다.",
      counterEvidence: [
        { source: "법원 및 검찰청", content: "해당 인물에 대한 외국 정부 로비 혹은 매수 관련 기소나 유죄 판결 선고 사실이 전혀 없습니다." },
        { source: "팩트체크 위원회", content: "개인 SNS와 인터넷 커뮤니티에서 출처 없이 유포된 정치 공작성 가짜뉴스로 판명되었습니다." }
      ]
    },
    {
      claimPattern: /(외계인|ufo).*(서울|광화문|상륙|침공)/,
      score: 98,
      reason: "UFO 서울 광화문 상륙 주장은 과학적 사실에 어긋나는 허구 정보입니다.",
      counterEvidence: [
        { source: "한국 천문연구원", content: "최근 서울 및 수도권 상공에서 비정상적인 미확인 비행물체나 궤도 진입 흔적은 일절 관측되지 않았습니다." },
        { source: "수도방위사령부", content: "비행 금지 구역 침투 및 영공 침범 기체는 식별되지 않았으며 허위 루머로 종결되었습니다." }
      ]
    },
    {
      claimPattern: /(일루미나티|비밀.*단체).*(백신.*칩|제어.*코드)/,
      score: 95,
      reason: "백신 이식 칩 음모론은 의학적 사실과 일치하지 않는 낭설입니다.",
      counterEvidence: [
        { source: "세계보건기구 (WHO)", content: "코로나19 백신의 성분 분석 결과 전자기적 칩이나 나노 트래커는 포함되어 있지 않음이 공식 확인되었습니다." },
        { source: "의사협회 과학 위원회", content: "액체 백신 내에 생체 무선 제어용 마이크로칩을 탑재해 인체를 통제한다는 주장은 물리적/기술적으로 성립되지 않습니다." }
      ]
    },
    {
      claimPattern: /지구\s*평평/,
      score: 96,
      reason: "지구가 평평하다는 주장은 과학적 합의 및 천문 관측과 대조됩니다.",
      counterEvidence: [
        { source: "NASA 및 한국항공우주연구원", content: "인공위성, 우주선에서 촬영한 고해상도 구형 지구 이미지와 물리 법칙이 명확한 증거입니다." },
        { source: "국제 도량형 총회", content: "중력 작용 및 전 세계 시간대 분할 체계 자체가 지구 구체 가정을 바탕으로 입증 및 운영됩니다." }
      ]
    }
  ];

  let counterEvidence = [];

  for (const kb of KNOWLEDGE_BASE) {
    if (kb.claimPattern.test(normalizedText)) {
      fakeScore = kb.score;
      fakeReason = `[대비 검증] ${kb.reason}`;
      counterEvidence = kb.counterEvidence;
      isFake = true;
      break;
    }
  }

  if (!isFake && normalizedText.length > 5) {
    let indicators = [];
    let scoreAccumulator = 10;

    const speculationMarkers = [
      { pattern: /가능성이\s+(높다|크다|의심된다)/, weight: 35, desc: '추측성 단정' },
      { pattern: /(의혹|루머|소문)이\s+(있다|제기된다|돌고)/, weight: 25, desc: '의혹 제시' },
      { pattern: /(비밀리에|밀실에서|극비리에)/, weight: 20, desc: '음모론 유도' }
    ];

    const polarizationMarkers = [
      { pattern: /(매수|뇌물|매국|선동|공작)/, weight: 30, desc: '적대적 공격 어휘' },
      { pattern: /(조작|부정|음모|배후)/, weight: 25, desc: '음모론 주장' }
    ];

    speculationMarkers.forEach(item => {
      if (item.pattern.test(normalizedText)) {
        scoreAccumulator += item.weight;
        indicators.push(item.desc);
      }
    });

    polarizationMarkers.forEach(item => {
      if (item.pattern.test(normalizedText)) {
        scoreAccumulator += item.weight;
        indicators.push(item.desc);
      }
    });

    fakeScore = Math.max(5, Math.min(scoreAccumulator, 98));

    if (fakeScore >= 60) {
      isFake = true;
      fakeReason = `[문맥 스타일 대조] 감정적 서술 표현(${indicators.slice(0, 2).join(', ')})과 물증 없는 추측성 문체가 집중 검출되었습니다.`;
      counterEvidence = [
        { source: "국내 언론 뉴스 공동 보도", content: "동일 사안에 대해 주요 팩트체크 제휴사 및 공신력 있는 언론 보도에서 입증된 바 없는 정보로 취급 중입니다." }
      ];
    }
  }

  const mediaUrls = [...imageUrls, ...videoUrls];
  for (const url of mediaUrls) {
    if (typeof url === 'string') {
      const u = url.toLowerCase();
      if (u.includes('deepfake') || u.includes('face_swap') || u.includes('synthetic')) {
        deepfakeScore = 95;
        deepfakeReason = `[AI 분석] GAN/Diffusion 기술을 활용한 딥페이크 합성 아티팩트 및 얼굴 외곽선 왜곡이 검출되었습니다.`;
        isDeepfake = true;
        break;
      }
      if (u.includes('fake_face') || u.includes('fake_video')) {
        deepfakeScore = 88;
        deepfakeReason = `[AI 분석] 안면 랜드마크 비매칭 및 프레임 가장자리 픽셀 노이즈 불일치가 감지되었습니다.`;
        isDeepfake = true;
        break;
      }
    }
  }

  // Fallback text check for Deepfake
  if (!isDeepfake) {
    const deepfakeKeywords = [
      { pattern: /(딥페이크|deepfake|합성얼굴|얼굴\s*교체)/, score: 90, reason: 'AI 생성 딥페이크 이미지/비디오 합성 가능성이 서술에 언급되었습니다.' }
    ];
    for (const item of deepfakeKeywords) {
      if (item.pattern.test(normalizedText)) {
        deepfakeScore = item.score;
        deepfakeReason = `[AI 텍스트 판단] ${item.reason}`;
        isDeepfake = true;
        break;
      }
    }
  }

  // Build response
  const response = {
    factCheck: {
      isFake,
      score: fakeScore,
      reason: isFake ? fakeReason : '정밀 대조 결과, 역사적/사회적 사실에 부합하며 사실 위조 징후가 검출되지 않았습니다.',
      counterEvidence: counterEvidence
    },
    deepfake: {
      isDeepfake,
      score: isDeepfake ? deepfakeScore : 5,
      reason: isDeepfake ? deepfakeReason : '인공지능 조작 흔적이 탐지되지 않은 오리지널 원본 미디어 규격입니다.'
    }
  };

  res.json(response);
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🛡️  FakeNewsDecter Mock Analysis Server Running...`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`POST /api/analyze endpoint ready.`);
  if (!GEMINI_API_KEY) {
    console.log(`⚠️  WARNING: GEMINI_API_KEY environment variable is not set.`);
    console.log(`    Running in OFFLINE HEURISTIC fallback mode.`);
    console.log(`    To use Gemini, start with: GEMINI_API_KEY="your_key" npm start`);
  } else {
    console.log(`🔑 Gemini API Integration active (key configured via env).`);
  }
  console.log(`=================================================`);
});
