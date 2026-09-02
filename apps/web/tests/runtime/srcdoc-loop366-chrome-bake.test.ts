import { writeFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

describe('루프366 chrome-ready bake artifact', () => {
  it('writes hoisted compact srcdoc for host-next (no #stage section)', () => {
    const html = `<!doctype html><html><head>
<style>.slide{width:100vw;height:100vh}</style>
</head><body>
<section class="stage" id="stage">
  <section class="slide" style="width:1920px;height:1080px">Page one topic</section>
  <section class="slide" style="width:1920px;height:1080px">Page two topic</section>
</section>
<script>
  (function () {
    var stage = document.getElementById('stage');
    var i = 0;
    window.go = function () {
      i += 1;
      if (stage) stage.style.transform = 'translateX(-' + (i * 100) + 'vw)';
    };
  })();
</script>
</body></html>`;
    const srcdoc = buildSrcdoc(html, {
      deck: true,
      userBrief: '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
    });
    expect(srcdoc).toContain('compactStackedDeckEnabled = true');
    expect(srcdoc).not.toMatch(/<section\b[^>]*\bid\s*=\s*["']stage["']/i);
    mkdirSync('/tmp/loop366-bake2', { recursive: true });
    writeFileSync('/tmp/loop366-bake2/srcdoc-hoisted.html', srcdoc);
    expect(srcdoc.length).toBeGreaterThan(500);
  });
});
