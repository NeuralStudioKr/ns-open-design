export type OfficialTemplateGeneratedDeckFixture = {
  folder: string;
  html: string;
  motif: RegExp;
  label: string;
};

export const OFFICIAL_TEMPLATE_GENERATED_DECK_FIXTURES: OfficialTemplateGeneratedDeckFixture[] = [
  {
    folder: 'html-ppt-zhangzara-studio',
    label: 'Studio agency yellow/black chrome',
    // Require compact type-lock (not merely --f-display in :root) so Neutral Quicksand
    // headings cannot pass via token presence alone (§1.18).
    motif: /od-compact-type-lock[\s\S]*\.slide :is\(h1[\s\S]*?font-family:[^}]*Barlow/i,
    html: `<!doctype html><html lang="ko"><body style="margin:0">
<section class="slide dark" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 104px;background:#1c1c1c;color:#f5d200">
  <p class="studio-kicker" style="letter-spacing:.18em;font-weight:700">SENIOR ENGINEERING TRACK</p>
  <h1 style="font-size:132px;line-height:.92;margin:180px 0 36px">Cloud Native<br/>Engineering</h1>
  <p style="font-size:34px;max-width:1120px">컨테이너·마이크로서비스·플랫폼 운영을 실전 관점에서 해부한다.</p>
</section>
<section class="slide light" data-screen-label="02 Map" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:88px 104px;background:#f5d200;color:#1c1c1c">
  <h2 style="font-size:84px">운영 구조 지도</h2>
  <p style="font-size:32px">클러스터, 배포 파이프라인, 관측 가능성을 하나의 그림으로 정리한다.</p>
</section>
<section class="slide dark" data-screen-label="03 Close" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 104px;background:#1c1c1c;color:#f5d200">
  <h2 style="font-size:92px">Trade-off checklist</h2>
  <p style="font-size:32px">복잡도를 늘리기 전에 자동화, 장애 격리, 소유권을 먼저 확인한다.</p>
</section>
</body></html>`,
  },
  {
    folder: 'html-ppt-zhangzara-broadside',
    label: 'Broadside orange environment and massive Barlow type',
    motif: /od-compact-type-lock[\s\S]*\.slide :is\(h1[\s\S]*?font-family:[^}]*Barlow/i,
    html: `<!doctype html><html lang="ko"><body style="margin:0">
<section class="slide orange" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 104px;background:#e85d26;color:#111111">
  <p style="font-size:28px;letter-spacing:.16em;font-weight:800">PLATFORM MODERNIZATION</p>
  <h1 style="font-size:150px;line-height:.86;margin:168px 0 32px">Legacy<br/>Breakdown</h1>
  <p style="font-size:34px;max-width:1160px">20년 된 기술 스택을 실행 가능한 전환 계획으로 압축한다.</p>
</section>
<section class="slide dark" data-screen-label="02 Debt" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:88px 104px;background:#111111;color:#f0ece5">
  <h2 style="font-size:92px">부채가 쌓이는 지점</h2>
  <p style="font-size:34px">배포, 데이터, 운영 경계가 얽힐수록 변경 비용이 비선형으로 증가한다.</p>
</section>
<section class="slide orange" data-screen-label="03 Roadmap" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 104px;background:#e85d26;color:#111111">
  <h2 style="font-size:96px">90-day intervention</h2>
  <p style="font-size:34px">관측 가능성, ownership, strangler path를 먼저 고정한다.</p>
</section>
</body></html>`,
  },
  {
    folder: 'html-ppt-zhangzara-signal',
    label: 'Signal editorial navy/cream serif signal',
    motif: /od-compact-type-lock[\s\S]*\.slide :is\(h1[\s\S]*?font-family:[^}]*Source Serif 4/i,
    html: `<!doctype html><html lang="ko"><body style="margin:0">
<section class="slide dark" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 120px;background:#1c2644;color:#e2dcd0">
  <p style="font-size:24px;letter-spacing:.18em;color:#c8a870">MARKET SIGNAL REPORT</p>
  <h1 style="font-size:120px;line-height:.98;margin:180px 0 28px">읽어야 할<br/><em>시장 신호</em></h1>
  <p style="font-size:32px;max-width:1040px">노이즈를 걷어내고 다음 분기 의사결정에 필요한 지표만 남긴다.</p>
</section>
<section class="slide light" data-screen-label="02 Pattern" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 120px;background:#f0ece3;color:#1a2030">
  <h2 style="font-size:84px">세 가지 패턴</h2>
  <p style="font-size:32px">수요, 경쟁, 채널 비용의 변화가 같은 방향으로 움직이는지 확인한다.</p>
</section>
<section class="slide dark" data-screen-label="03 Decision" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 120px;background:#1c2644;color:#e2dcd0">
  <h2 style="font-size:92px">Decision window</h2>
  <p style="font-size:32px">지표가 아니라 행동 기준을 남기는 보고서로 마무리한다.</p>
</section>
</body></html>`,
  },
  {
    folder: 'html-ppt-zhangzara-daisy-days',
    label: 'Daisy Days four-corner flower identity',
    motif: /deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i,
    html: `<!doctype html><html lang="ko"><body style="margin:0;background:#F5F0E6">
<section class="slide" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F0E6;color:#2D2D2D;padding:72px 88px">
  <h1>Expo Deep Dive</h1><p>Managed Workflow · EAS · Expo Router를 시니어 관점에서 빠르게 정리합니다.</p>
</section>
<section class="slide" data-screen-label="02 Workflow" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F0E6;color:#2D2D2D;padding:72px 88px">
  <h2>워크플로우 선택 기준</h2><ul><li>네이티브 확장 필요성</li><li>릴리즈 주기</li><li>팀의 운영 역량</li></ul>
</section>
<section class="slide" data-screen-label="03 OTA" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F0E6;color:#2D2D2D;padding:72px 88px">
  <h2>OTA 운영 안전장치</h2><p>채널, 런타임 버전, 롤백 기준을 먼저 설계합니다.</p>
</section>
</body></html>`,
  },
  {
    folder: 'html-ppt-zhangzara-capsule',
    label: 'Capsule oblong pill identity',
    motif: /<(?:div|span)[^>]*\bdeco-pill\b/i,
    html: `<!doctype html><html lang="ko"><body style="margin:0;background:#F5F5F0">
<section class="slide" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F5F0;color:#1A1A1A;padding:92px 108px">
  <h1>Monorepo for Senior Engineers</h1><p>하나의 저장소로 거대한 코드베이스를 정돈하는 아키텍처 전략</p>
  <div class="pill pill-coral" style="width:240px;height:64px">Nx</div>
</section>
<section class="slide" data-screen-label="02 Boundaries" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F5F0;color:#1A1A1A;padding:92px 108px">
  <h2>경계가 먼저입니다</h2><p>패키지 그래프, ownership, affected build가 확장성의 핵심입니다.</p>
</section>
<section class="slide" data-screen-label="03 Rollout" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F5F0;color:#1A1A1A;padding:92px 108px">
  <h2>점진적 이전 로드맵</h2><p>CI 캐시와 릴리즈 단위를 먼저 고정하고 팀별 이전을 진행합니다.</p>
</section>
</body></html>`,
  },
];
