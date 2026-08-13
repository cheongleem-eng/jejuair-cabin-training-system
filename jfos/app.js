// ===== SHOW UP Practice Tool - App Logic =====

document.addEventListener('DOMContentLoaded', function () {
    // --- Element References ---
    const closeBtn = document.getElementById('closeBtn');
    const searchBtn = document.getElementById('searchBtn');
    const dateInput = document.getElementById('dateInput');
    const calendarBtn = document.getElementById('calendarBtn');
    const showUpBtn = document.getElementById('showUpBtn');
    const passportBtn = document.getElementById('passportBtn');
    const printBtn = document.getElementById('printBtn');
    const passLink = document.getElementById('passLink');
    const myShowUpChk = document.getElementById('myShowUpChk');
    const myPassportChk = document.getElementById('myPassportChk');

    // --- State ---
    let showUpCompleted = false;
    let passportCompleted = false;

    // --- Modal System ---
    function createModal(title, message, callback) {
        // Remove existing modal if any
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';

        overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-header">
                    <span>${title}</span>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">${message}</div>
                <div class="modal-footer">
                    <button class="modal-ok-btn">확인</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeModal = () => {
            overlay.remove();
            if (callback) callback();
        };

        overlay.querySelector('.modal-close').addEventListener('click', closeModal);
        overlay.querySelector('.modal-ok-btn').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }

    function createConfirmModal(title, message, onConfirm, onCancel) {
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';

        overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-header">
                    <span>${title}</span>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">${message}</div>
                <div class="modal-footer" style="display: flex; gap: 10px; justify-content: center;">
                    <button class="modal-ok-btn confirm-yes">확인</button>
                    <button class="modal-ok-btn confirm-no" style="background: linear-gradient(180deg, #888 0%, #666 100%); border-color: #555;">취소</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeModal = () => overlay.remove();

        overlay.querySelector('.modal-close').addEventListener('click', () => {
            closeModal();
            if (onCancel) onCancel();
        });

        overlay.querySelector('.confirm-yes').addEventListener('click', () => {
            closeModal();
            if (onConfirm) onConfirm();
        });

        overlay.querySelector('.confirm-no').addEventListener('click', () => {
            closeModal();
            if (onCancel) onCancel();
        });
    }

    // --- Get Current Time String (Satellite Time: 1 hour later than KST) ---
    async function getSatelliteTimeString() {
        let now = new Date();
        
        // Try fetching online network time if available
        if (navigator.onLine) {
            try {
                const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Seoul', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    now = new Date(data.datetime);
                }
            } catch (e) {
                // Fallback to system local time if fetch fails
                now = new Date();
            }
        }
        
        // Add 1 hour (한국 시간 기준 + 1시간)
        now.setHours(now.getHours() + 1);
        
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function getCurrentTimeStringSync() {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    // --- Auto Update Initial SHOW UP Time (KST + 1 Hour) ---
    async function updateInitialShowUpTime() {
        const targetCell = document.querySelector('.flight-table .showup-time');
        if (targetCell && !showUpCompleted) {
            // First display local system time instantly
            targetCell.textContent = getCurrentTimeStringSync();
            
            // Then fetch precise network time if available
            const timeStr = await getSatelliteTimeString();
            if (!showUpCompleted) {
                targetCell.textContent = timeStr;
            }
        }
    }
    updateInitialShowUpTime();
    setInterval(updateInitialShowUpTime, 60000); // update every minute if not checked

    // --- SHOW UP Button ---
    showUpBtn.addEventListener('click', function () {
        myShowUpChk.click();
    });

    // --- PASSPORT Button ---
    passportBtn.addEventListener('click', function () {
        myPassportChk.click();
    });

    // --- Checkbox Direct Click Handlers ---
    myShowUpChk.addEventListener('click', function (e) {
        e.preventDefault(); // 기본 체크 동작 차단
        
        if (!showUpCompleted) {
            // 체크하려고 할 때 팝업
            createConfirmModal("", "S/U을 체크하시겠습니까?", async () => {
                // 확인 클릭 시
                myShowUpChk.checked = true;
                showUpCompleted = true;
                
                const targetCell = document.querySelector('.flight-table .showup-time');
                if (targetCell) {
                    const timeStr = await getSatelliteTimeString();
                    targetCell.innerHTML = `<span class="timestamp-display">${timeStr}</span>`;
                    targetCell.classList.add('showup-success');
                }
                
                // 저장 완료 팝업
                setTimeout(() => {
                    createModal("", "저장되었습니다.");
                }, 100);
            });
        } else {
            // 체크 해제는 즉시 반영
            myShowUpChk.checked = false;
            showUpCompleted = false;
            const targetCell = document.querySelector('.flight-table .showup-time');
            if (targetCell) {
                updateInitialShowUpTime();
                targetCell.classList.remove('showup-success');
            }
        }
    });

    myPassportChk.addEventListener('click', function (e) {
        e.preventDefault(); // 기본 체크 동작 차단
        
        if (!passportCompleted) {
            // 체크하려고 할 때 팝업
            createConfirmModal("", "PASSPORT를 체크하시겠습니까?", () => {
                // 확인 클릭 시
                myPassportChk.checked = true;
                passportCompleted = true;
                
                // 저장 완료 팝업
                setTimeout(() => {
                    createModal("", "저장되었습니다.");
                }, 100);
            });
        } else {
            // 체크 해제는 즉시 반영
            myPassportChk.checked = false;
            passportCompleted = false;
        }
    });

    // --- Keyboard shortcut ---
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const modal = document.querySelector('.modal-overlay');
            if (modal) {
                modal.remove();
            }
        }
    });
});
