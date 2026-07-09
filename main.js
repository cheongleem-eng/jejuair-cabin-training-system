/* ============================================================
   Pattern Lock Component — main.js (Touch Sequence Mode)
   ============================================================ */

class PatternLock {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.path = [];
    this.correctPattern = "412369";
    this.isProcessing = false;
    
    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="pattern-grid sequence-mode">
        ${Array.from({ length: 9 }, (_, i) => `
          <div class="dot-wrapper" data-index="${i + 1}">
            <div class="dot"></div>
          </div>
        `).join('')}
      </div>
    `;
    
    this.grid = this.container.querySelector('.pattern-grid');
    this.dotWrappers = this.container.querySelectorAll('.dot-wrapper');
    
    this.addEventListeners();
  }

  addEventListeners() {
    this.dotWrappers.forEach(el => {
      // 터치와 마우스 클릭 모두 대응
      const handleInput = (e) => {
        e.preventDefault();
        if (this.isProcessing) return;
        
        const index = el.dataset.index;
        this.handleDotInput(index, el);
      };

      el.addEventListener('touchstart', handleInput, { passive: false });
      el.addEventListener('mousedown', handleInput);
    });
  }

  handleDotInput(index, element) {
    // 중복 입력 방지 (연속으로 같은 번호를 누르는 경우 제외하고 싶다면 조건 추가 가능)
    // 여기서는 단순히 순서대로 추가
    this.path.push(index);
    
    // 시각적 피드백
    element.classList.add('active');
    if (navigator.vibrate) navigator.vibrate(10);

    // 패턴 길이 체크
    if (this.path.length === this.correctPattern.length) {
      this.checkPattern();
    }
  }

  checkPattern() {
    this.isProcessing = true;
    const userInput = this.path.join('');
    
    if (userInput === this.correctPattern) {
      this.grid.classList.add('success');
      if (navigator.vibrate) navigator.vibrate([30, 30]);
      setTimeout(() => this.unlock(), 500);
    } else {
      this.grid.classList.add('error');
      if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
      setTimeout(() => this.reset(), 800);
    }
  }

  unlock() {
    document.body.classList.remove('lock-active');
    const lockScreen = document.getElementById('screen-lock');
    if (lockScreen) {
      lockScreen.style.opacity = '0';
      lockScreen.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        lockScreen.style.display = 'none';
        document.getElementById('screen-portal').classList.add('active');
      }, 500);
    }
  }

  reset() {
    this.path = [];
    this.isProcessing = false;
    this.grid.classList.remove('error', 'success');
    this.dotWrappers.forEach(el => el.classList.remove('active'));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('pattern-container');
  if (container) new PatternLock('pattern-container');
});
