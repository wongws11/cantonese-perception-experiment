// ============================================
// SMART AUDIO PRELOADER
// ============================================

class SmartAudioPreloader {
	constructor(audioContext, totalStimuli = 75, bufferAhead = 3) {
		this.audioContext = audioContext;
		this.totalStimuli = totalStimuli;
		this.bufferAhead = bufferAhead;
		this.audioBuffers = new Map();
		this.loadingPromises = new Map();
		this.loadedCount = 0;
		this.failedLoads = new Set();
		this.loadTimes = [];
		this.onPauseCallback = null;
		this.onResumeCallback = null;
	}

	setPauseResumeCallbacks(onPause, onResume) {
		this.onPauseCallback = onPause;
		this.onResumeCallback = onResume;
	}

	async preloadInitial(sequence) {
		const initialBatch = sequence.slice(0, this.bufferAhead);
		console.log(`Preloading initial ${initialBatch.length} files...`);

		const startTime = performance.now();

		try {
			await Promise.all(initialBatch.map((stimId) => this.loadAudio(stimId)));

			const loadTime = performance.now() - startTime;
			console.log(`Initial batch loaded in ${(loadTime / 1000).toFixed(2)}s`);
			return true;
		} catch (error) {
			console.error('Failed to load initial batch:', error);
			throw new Error('Could not load initial audio files. Please check your connection.');
		}
	}

	async preloadAhead(sequence, currentTrialIndex) {
		const startIdx = currentTrialIndex + this.bufferAhead;
		const endIdx = Math.min(startIdx + this.bufferAhead, sequence.length);
		const nextBatch = sequence.slice(startIdx, endIdx);

		const toLoad = nextBatch.filter((stimId) => !this.audioBuffers.has(stimId) && !this.loadingPromises.has(stimId));

		if (toLoad.length === 0) return;

		console.log(`Background loading: trials ${startIdx}-${endIdx - 1}`);
		toLoad.forEach((stimId) => this.loadAudio(stimId));
	}

	async getAudioBuffer(stimulusId, showPauseUI = true) {
		if (this.audioBuffers.has(stimulusId)) {
			return this.audioBuffers.get(stimulusId);
		}

		if (this.loadingPromises.has(stimulusId)) {
			console.warn(`Audio ${stimulusId} not ready yet, pausing experiment...`);

			if (showPauseUI && this.onPauseCallback) {
				this.onPauseCallback(stimulusId);
			}

			const buffer = await this.loadingPromises.get(stimulusId);

			if (showPauseUI && this.onResumeCallback) {
				this.onResumeCallback();
			}

			return buffer;
		}

		console.warn(`Emergency load for stimulus ${stimulusId}!`);

		if (showPauseUI && this.onPauseCallback) {
			this.onPauseCallback(stimulusId);
		}

		const buffer = await this.loadAudio(stimulusId);

		if (showPauseUI && this.onResumeCallback) {
			this.onResumeCallback();
		}

		return buffer;
	}

	async ensureNextTrialReady(sequence, currentIndex) {
		if (currentIndex >= sequence.length) return true;

		const nextStimId = sequence[currentIndex];

		if (!this.audioBuffers.has(nextStimId)) {
			console.warn(`Next trial (${nextStimId}) not ready, waiting...`);

			if (this.onPauseCallback) {
				this.onPauseCallback(nextStimId);
			}

			await this.getAudioBuffer(nextStimId, false);

			if (this.onResumeCallback) {
				this.onResumeCallback();
			}
		}

		return true;
	}

	async loadAudio(stimulusId) {
		if (this.failedLoads.has(stimulusId)) {
			throw new Error(`Stimulus ${stimulusId} previously failed to load`);
		}

		const startTime = performance.now();

		try {
			const loadPromise = fetch(`audio/${stimulusId}.m4a`)
				.then((response) => {
					if (!response.ok) {
						throw new Error(`HTTP ${response.status}: ${response.statusText}`);
					}
					return response.arrayBuffer();
				})
				.then((arrayBuffer) => this.audioContext.decodeAudioData(arrayBuffer))
				.then((audioBuffer) => {
					this.audioBuffers.set(stimulusId, audioBuffer);
					this.loadedCount++;

					const loadTime = performance.now() - startTime;
					this.loadTimes.push(loadTime);

					console.log(`✓ Loaded ${stimulusId}.m4a in ${(loadTime / 1000).toFixed(2)}s ` + `(${this.loadedCount}/${this.totalStimuli})`);

					return audioBuffer;
				})
				.catch((error) => {
					this.failedLoads.add(stimulusId);
					throw error;
				})
				.finally(() => {
					this.loadingPromises.delete(stimulusId);
				});

			this.loadingPromises.set(stimulusId, loadPromise);
			return await loadPromise;
		} catch (error) {
			console.error(`✗ Failed to load stimulus ${stimulusId}:`, error);
			this.loadingPromises.delete(stimulusId);
			throw error;
		}
	}

	getProgress() {
		return {
			loaded: this.loadedCount,
			total: this.totalStimuli,
			percentage: (this.loadedCount / this.totalStimuli) * 100,
			currentlyLoading: this.loadingPromises.size,
			failed: this.failedLoads.size,
			avgLoadTime: this.loadTimes.length > 0 ? this.loadTimes.reduce((a, b) => a + b) / this.loadTimes.length : 0,
		};
	}

	clearOldBuffers(sequence, currentIndex, keepBehind = 2) {
		const keepStimuli = new Set([...sequence.slice(Math.max(0, currentIndex - keepBehind), currentIndex + this.bufferAhead + 3)]);

		let cleared = 0;
		for (const [stimId] of this.audioBuffers.entries()) {
			if (!keepStimuli.has(stimId)) {
				this.audioBuffers.delete(stimId);
				cleared++;
			}
		}

		if (cleared > 0) {
			console.log(`Cleared ${cleared} old buffers from memory`);
		}
	}
}

// ============================================
// EXPERIMENT CLASS
// ============================================

class CantoneseExperiment {
	constructor() {
		this.sessionId = crypto.randomUUID();
		this.audioContext = new AudioContext();
		this.audioPreloader = new SmartAudioPreloader(this.audioContext, 75, 3);
		this.sequence = [];
		this.results = [];
		this.currentTrial = 0;
		this.isPaused = false;

		this.audioPreloader.setPauseResumeCallbacks(
			(stimId) => this.showPauseScreen(stimId),
			() => this.hidePauseScreen(),
		);
	}

	async registerServiceWorker() {
		if ('serviceWorker' in navigator) {
			try {
				const registration = await navigator.serviceWorker.register('/sw.js');
				console.log('Service Worker registered:', registration);
				await navigator.serviceWorker.ready;
				console.log('Service Worker ready');
			} catch (error) {
				console.error('Service Worker registration failed:', error);
			}
		}
	}

	async init() {
		await this.registerServiceWorker();

		const response = await fetch('characters.json');
		const data = await response.json();
		this.characters = data.stimuli;
		this.instructions = data.instructions;

		this.sequence = this.shuffle([...Array(75).keys()].map((i) => i + 1));

		await this.showLoadingScreen();
		await this.audioPreloader.preloadInitial(this.sequence);
		this.hideLoadingScreen();

		await this.showConsent();
		await this.showInstructions();
		await this.runExperiment();
		await this.showEnd();
		await this.markExperimentComplete();
	}

	async showLoadingScreen() {
		const screen = document.getElementById('screen');
		screen.innerHTML = `
      <div class="loading-screen">
        <h2>載入實驗資料中...</h2>
        <div class="progress-container">
          <div id="loading-bar" class="loading-bar"></div>
        </div>
        <p id="loading-text">準備中...</p>
      </div>
    `;

		this.loadingInterval = setInterval(() => {
			const progress = this.audioPreloader.getProgress();
			const bar = document.getElementById('loading-bar');
			const text = document.getElementById('loading-text');

			if (bar && text) {
				bar.style.width = `${progress.percentage}%`;
				text.textContent = `${progress.loaded} / ${progress.total} 檔案`;
			}
		}, 100);
	}

	hideLoadingScreen() {
		if (this.loadingInterval) {
			clearInterval(this.loadingInterval);
			this.loadingInterval = null;
		}
	}

	showPauseScreen(stimulusId) {
		this.isPaused = true;

		let overlay = document.getElementById('pause-overlay');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.id = 'pause-overlay';
			overlay.className = 'pause-overlay';
			document.body.appendChild(overlay);
		}

		overlay.innerHTML = `
      <div class="pause-content">
        <div class="spinner"></div>
        <h2>載入音訊檔案中...</h2>
        <p>正在載入試驗 ${stimulusId} 的音訊</p>
        <p class="pause-note">請稍候，實驗將自動繼續</p>
      </div>
    `;
		overlay.style.display = 'flex';

		console.log(`Experiment paused for stimulus ${stimulusId}`);
	}

	hidePauseScreen() {
		this.isPaused = false;

		const overlay = document.getElementById('pause-overlay');
		if (overlay) {
			overlay.style.display = 'none';
		}

		console.log('Experiment resumed');
	}

	async runExperiment() {
		const total = this.sequence.length;

		for (let i = 0; i < total; i++) {
			const stimulusId = this.sequence[i];
			const character = this.characters[stimulusId - 1];

			await this.audioPreloader.ensureNextTrialReady(this.sequence, i);
			this.audioPreloader.preloadAhead(this.sequence, i);
			this.updateProgress((i / total) * 100);

			const rt = await this.runTrial(stimulusId, character);

			const trialResult = {
				trialNumber: i + 1,
				stimulusId: stimulusId,
				character: character,
				reactionTime: rt,
				timestamp: Date.now(),
				wasPaused: this.isPaused,
			};

			this.results.push(trialResult);
			await this.submitTrialResult(trialResult);

			if (i % 10 === 0 && i > 0) {
				this.audioPreloader.clearOldBuffers(this.sequence, i);
			}

			await this.showBlank(500);
		}

		this.updateProgress(100);
	}

	async runTrial(stimulusId, character) {
		this.showCharacter(character);
		await this.sleep(1000);

		const audioBuffer = await this.audioPreloader.getAudioBuffer(stimulusId);

		const source = this.audioContext.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(this.audioContext.destination);

		const t1 = performance.now();
		source.start(0);

		const t2 = await this.waitForResponse(16000, source);
		const rt = t2 - t1;

		return rt;
	}

	async submitTrialResult(trialData) {
		const payload = {
			sessionId: this.sessionId,
			userAgent: navigator.userAgent,
			screenResolution: `${window.screen.width}x${window.screen.height}`,
			trial: trialData,
		};

		try {
			const response = await fetch('/api/trial', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			console.log(`✓ Trial ${trialData.trialNumber} saved to server`);
		} catch (error) {
			console.error(`✗ Failed to save trial ${trialData.trialNumber}:`, error);
			this.saveToLocalStorage(trialData);
		}
	}

	saveToLocalStorage(trialData) {
		try {
			const key = `experiment_${this.sessionId}_trial_${trialData.trialNumber}`;
			localStorage.setItem(
				key,
				JSON.stringify({
					sessionId: this.sessionId,
					userAgent: navigator.userAgent,
					screenResolution: `${window.screen.width}x${window.screen.height}`,
					trial: trialData,
					savedAt: Date.now(),
					needsSync: true,
				}),
			);
			console.log(`Trial ${trialData.trialNumber} saved to localStorage`);
		} catch (e) {
			console.error('Failed to save to localStorage:', e);
		}
	}

	async markExperimentComplete() {
		try {
			const response = await fetch('/api/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: this.sessionId,
					totalTrials: this.results.length,
					completedAt: new Date().toISOString(),
				}),
			});

			if (response.ok) {
				console.log('✓ Experiment marked as complete');
				this.cleanupLocalStorage();
			}
		} catch (error) {
			console.error('Failed to mark experiment complete:', error);
		}
	}

	cleanupLocalStorage() {
		const keys = Object.keys(localStorage);
		keys.forEach((key) => {
			if (key.startsWith(`experiment_${this.sessionId}_trial_`)) {
				localStorage.removeItem(key);
			}
		});
	}

	shuffle(array) {
		const shuffled = [...array];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	showCharacter(character) {
		const screen = document.getElementById('screen');
		screen.innerHTML = `<div class="stimulus">${character}</div>`;
	}

	async showBlank(duration) {
		const screen = document.getElementById('screen');
		screen.innerHTML = '';
		await this.sleep(duration);
	}

	async showInstructions() {
		const screen = document.getElementById('screen');
		screen.innerHTML = `
      <div class="instructions">
        ${this.instructions.intro
					.split('\n\n')
					.map((para) => `<p>${para}</p>`)
					.join('')}
      </div>
    `;
		await this.waitForSpace();
		await this.showBlank(500);
	}

	async showConsent() {
		const screen = document.getElementById('screen');
		screen.innerHTML = `
      <div class="consent-screen">
        <h2>資料收集聲明</h2>
        <div class="consent-content">
          <p>此為一項語言學研究實驗，將會匿名收集閣下對粵語音節感知的反應時間。實驗時間約為 2 - 3 分鐘。</p>
          <p>（實驗已於 2018 年完結，是次收集的反應數據不會再受分析，數據僅保存作為演示用途。）</p>
          <p><strong>隱私政策：</strong></p>
          <ul>
            <li>本實驗不會收集 IP 地址等個人可識別信息</li>
            <li>本實驗會收集用戶代理信息（User-Agent）作調試用途，用戶代理信息只能識別裝置類型，無法識別個人身份</li>
          </ul>
        </div>
        <button id="consent-button" class="consent-button">我同意</button>
      </div>
    `;

		return new Promise((resolve) => {
			setTimeout(() => {
				const button = document.getElementById('consent-button');
				if (button) {
					const handleClick = (e) => {
						e.stopPropagation();
						button.removeEventListener('click', handleClick);
						resolve();
					};
					button.addEventListener('click', handleClick);
				} else {
					console.error('Consent button not found');
					resolve();
				}
			}, 0);
		});
	}

	async showEnd() {
		const screen = document.getElementById('screen');
		screen.innerHTML = `
      <div class="end-screen">${this.instructions.end}</div>
    `;
		await this.sleep(3000);
	}

	waitForSpace() {
		return new Promise((resolve) => {
			let done = false;
			const screen = document.getElementById('screen');

			const resolveOnce = () => {
				if (done) return;
				done = true;
				document.removeEventListener('keydown', keyHandler);
				screen && screen.removeEventListener('click', clickHandler);
				screen && screen.removeEventListener('touchend', touchHandler);
				resolve();
			};

			const keyHandler = (e) => {
				if (e.code === 'Space') {
					resolveOnce();
				}
			};

			const clickHandler = () => resolveOnce();
			const touchHandler = (e) => {
				// Prevent default to avoid ghost clicks/double-tap zoom
				e.preventDefault();
				resolveOnce();
			};

			document.addEventListener('keydown', keyHandler);
			screen && screen.addEventListener('click', clickHandler, { passive: true });
			screen && screen.addEventListener('touchend', touchHandler, { passive: false });
		});
	}

	waitForResponse(timeout, audioSource) {
		return new Promise((resolve) => {
			let responded = false;
			const screen = document.getElementById('screen');

			const resolveOnce = () => {
				if (responded) return;
				responded = true;
				audioSource.stop();
				document.removeEventListener('keydown', keyHandler);
				screen && screen.removeEventListener('click', clickHandler);
				screen && screen.removeEventListener('touchend', touchHandler);
				resolve(performance.now());
			};

			const keyHandler = (e) => {
				if (e.code === 'Space') {
					resolveOnce();
				}
			};

			const clickHandler = () => resolveOnce();
			const touchHandler = (e) => {
				e.preventDefault();
				resolveOnce();
			};

			document.addEventListener('keydown', keyHandler);
			screen && screen.addEventListener('click', clickHandler, { passive: true });
			screen && screen.addEventListener('touchend', touchHandler, { passive: false });

			setTimeout(() => {
				if (!responded) {
					responded = true;
					document.removeEventListener('keydown', keyHandler);
					screen && screen.removeEventListener('click', clickHandler);
					screen && screen.removeEventListener('touchend', touchHandler);
					resolve(performance.now());
				}
			}, timeout);
		});
	}

	updateProgress(percent) {
		const progress = document.getElementById('progress');
		if (progress) {
			progress.style.width = `${percent}%`;
		}
	}

	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// Start experiment
document.addEventListener('DOMContentLoaded', () => {
	const experiment = new CantoneseExperiment();
	experiment.init();
});
