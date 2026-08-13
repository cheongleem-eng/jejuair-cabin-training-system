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

    // --- Date/Time Helpers ---
    function formatTimeStr(dateObj) {
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    async function getSatelliteTimeDate() {
        let now = new Date();
        if (navigator.onLine) {
            try {
                const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Seoul', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    now = new Date(data.datetime);
                }
            } catch (e) { }
        }
        now.setHours(now.getHours() + 1); // SHOW UP = KST + 1 hour
        now.setMinutes(Math.round(now.getMinutes() / 10) * 10);
        now.setSeconds(0);
        return now;
    }

    function getSyncTimeDate() {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(Math.round(now.getMinutes() / 10) * 10);
        now.setSeconds(0);
        return now;
    }

    // --- Dynamic Flight Times (1h 20m after Show Up) ---
    function updateDynamicFlightTimes(showUpDate) {
        const addMin = (d, m) => new Date(d.getTime() + m * 60000);
        
        // 1. GMP/CJU: STD = ShowUp + 1h20m (80m), STA = STD + 1h10m (70m)
        const std1 = addMin(showUpDate, 80);
        const sta1 = addMin(std1, 70);
        
        // 2. CJU/PUS: STD = STA1 + 35m, STA = STD + 60m
        const std2 = addMin(sta1, 35);
        const sta2 = addMin(std2, 60);

        // 3. PUS/CJU: STD = STA2 + 40m, STA = STD + 60m
        const std3 = addMin(sta2, 40);
        const sta3 = addMin(std3, 60);

        // 4. CJU/GMP: STD = STA3 + 35m, STA = STD + 70m
        const std4 = addMin(sta3, 35);
        const sta4 = addMin(std4, 70);

        const setTime = (selector, std, sta) => {
            const el = document.querySelector(selector);
            if (el) el.textContent = `${formatTimeStr(std)} / ${formatTimeStr(sta)}`;
        };

        setTime('.std-sta-1', std1, sta1);
        setTime('.std-sta-2', std2, sta2);
        setTime('.std-sta-3', std3, sta3);
        setTime('.std-sta-4', std4, sta4);
    }

    // --- Auto Update Initial SHOW UP Time ---
    async function updateInitialShowUpTime() {
        const targetCell = document.querySelector('.flight-table .showup-time');
        if (targetCell && !showUpCompleted) {
            let syncDate = getSyncTimeDate();
            targetCell.textContent = formatTimeStr(syncDate);
            updateDynamicFlightTimes(syncDate);
            
            const satDate = await getSatelliteTimeDate();
            if (!showUpCompleted) {
                targetCell.textContent = formatTimeStr(satDate);
                updateDynamicFlightTimes(satDate);
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

    // --- Update CREW INFO Table (Im Hullyeon Row) ---
    const crewShowUpIm = document.getElementById('crewShowUpIm');
    const crewPassportIm = document.getElementById('crewPassportIm');

    function updateCrewStatus() {
        if (crewShowUpIm) {
            if (showUpCompleted) {
                crewShowUpIm.textContent = 'O';
                crewShowUpIm.style.color = '#007bff';
                crewShowUpIm.style.fontWeight = 'bold';
            } else {
                crewShowUpIm.textContent = 'X';
                crewShowUpIm.style.color = '';
                crewShowUpIm.style.fontWeight = '';
            }
        }
        if (crewPassportIm) {
            if (passportCompleted) {
                crewPassportIm.textContent = 'O';
                crewPassportIm.style.color = '#007bff';
                crewPassportIm.style.fontWeight = 'bold';
            } else {
                crewPassportIm.textContent = 'X';
                crewPassportIm.style.color = '';
                crewPassportIm.style.fontWeight = '';
            }
        }
    }

    // --- Checkbox Direct Click Handlers ---
    myShowUpChk.addEventListener('click', function (e) {
        e.preventDefault(); // 기본 체크 동작 차단
        
        if (!showUpCompleted) {
            // 체크하려고 할 때 팝업
            createConfirmModal("", "S/U을 체크하시겠습니까?", async () => {
                // 확인 클릭 시
                myShowUpChk.checked = true;
                showUpCompleted = true;
                updateCrewStatus();
                
                const targetCell = document.querySelector('.flight-table .showup-time');
                if (targetCell) {
                    const satDate = await getSatelliteTimeDate();
                    const timeStr = formatTimeStr(satDate);
                    targetCell.innerHTML = `<span class="timestamp-display">${timeStr}</span>`;
                    targetCell.classList.add('showup-success');
                    updateDynamicFlightTimes(satDate);
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
            updateCrewStatus();
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
                updateCrewStatus();
                
                // 저장 완료 팝업
                setTimeout(() => {
                    createModal("", "저장되었습니다.");
                }, 100);
            });
        } else {
            // 체크 해제는 즉시 반영
            myPassportChk.checked = false;
            passportCompleted = false;
            updateCrewStatus();
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
