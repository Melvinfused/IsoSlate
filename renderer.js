let currentCourse = null;
let currentProgress = {};
let activeVideoPath = null;
let overlayTimeout = null;

const CONST = window.APP_CONSTANTS;

const launchScreen = document.getElementById('launch-screen');
const playerScreen = document.getElementById('player-screen');
const sidebarTree = document.getElementById('sidebar-tree');
const courseTitleEl = document.getElementById('course-title');
const mainVideo = document.getElementById('main-video');
const preloadVideo = document.getElementById('preload-video');
const currentVideoTitle = document.getElementById('current-video-title');
const mainTrack = document.getElementById('main-track');
const videoContainer = document.getElementById('video-container');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnSkipBack = document.getElementById('btn-skip-back');
const btnSkipForward = document.getElementById('btn-skip-forward');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnCC = document.getElementById('btn-cc');
const sidebarEl = document.getElementById('sidebar');
const btnShowSidebar = document.getElementById('btn-show-sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const bgAsciiEl = document.getElementById('launch-bg-ascii');

const ICON_PLAY = '&#xE102;';
const ICON_PAUSE = '&#xE103;';

let debounceTimer = null;
let pendingSave = false;
function scheduleSave(force = false) {
    pendingSave = true;
    if (force) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        window.electronAPI.writeStore(currentProgress);
        pendingSave = false;
    } else if (!debounceTimer) {
        debounceTimer = setTimeout(() => {
            if (pendingSave) {
                window.electronAPI.writeStore(currentProgress);
                pendingSave = false;
            }
            debounceTimer = null;
        }, CONST.DEBOUNCE_MS);
    }
}

window.addEventListener('beforeunload', () => {
    if (pendingSave) window.electronAPI.writeStoreSync(currentProgress);
});

document.getElementById('btn-win-min').addEventListener('click', () => window.electronAPI.windowMinimize());
document.getElementById('btn-win-max').addEventListener('click', () => window.electronAPI.windowMaximize());
document.getElementById('btn-win-close').addEventListener('click', () => window.electronAPI.windowClose());

async function init() {
    currentProgress = await window.electronAPI.readStore();
    renderRecentCourses();
    initAsciiCircle();
}

const asciiChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*()_+{}[]|:;"<>,.?/~`';
const asciiRadius = 26; 
let currentAsciiGrid = [];

function initAsciiCircle() {
    if (!bgAsciiEl) return;
    currentAsciiGrid = [];
    
    for (let y = -asciiRadius; y <= asciiRadius; y++) {
        let row = [];
        for (let x = -asciiRadius * 2; x <= asciiRadius * 2; x++) {
            const distance = Math.sqrt((x * 0.5) ** 2 + y ** 2);
            if (distance > asciiRadius - 4 && distance < asciiRadius) {
                row.push(asciiChars.charAt(Math.floor(Math.random() * asciiChars.length)));
            } else {
                row.push(' ');
            }
        }
        currentAsciiGrid.push(row);
    }
    
    bgAsciiEl.textContent = currentAsciiGrid.map(row => row.join('')).join('\n');
    
    setInterval(() => {
        for (let i = 0; i < 15; i++) {
            const rY = Math.floor(Math.random() * currentAsciiGrid.length);
            const rX = Math.floor(Math.random() * currentAsciiGrid[0].length);
            if (currentAsciiGrid[rY][rX] !== ' ') {
                currentAsciiGrid[rY][rX] = asciiChars.charAt(Math.floor(Math.random() * asciiChars.length));
            }
        }
        bgAsciiEl.textContent = currentAsciiGrid.map(row => row.join('')).join('\n');
    }, CONST.ASCII_UPDATE_INTERVAL_MS);
}

function countVids(nodes) {
    let cnt = 0;
    nodes.forEach(n => {
        if (n.type === 'video') cnt++;
        else if (n.type === 'directory') cnt += countVids(n.children);
    });
    return cnt;
}

sidebarTree.addEventListener('click', (e) => {
    const videoNode = e.target.closest('.node-video');
    if (videoNode) {
        const path = videoNode.dataset.path;
        const videoObj = findVideoByPath(currentCourse.children, path);
        if (videoObj) playVideo(videoObj, path);
        return;
    }
    
    const headerNode = e.target.closest('.node-header');
    if (headerNode && (headerNode.classList.contains('node-lesson') || headerNode.classList.contains('node-module'))) {
        const parentDir = headerNode.parentNode;
        const content = parentDir.querySelector('.node-content');
        if (content) {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            const expander = headerNode.querySelector('.expander');
            if (expander) expander.textContent = isHidden ? '▼' : '▷';
        }
    }
});

function findVideoByPath(nodes, searchPath) {
    for (let node of nodes) {
        if (node.type === 'video' && pathRelative(currentCourse.path, node.path) === searchPath) return node;
        if (node.type === 'directory') {
            const found = findVideoByPath(node.children, searchPath);
            if (found) return found;
        }
    }
    return null;
}

function renderRecentCourses() {
    const list = document.getElementById('recent-courses-list');
    list.innerHTML = '';
    const paths = Object.keys(currentProgress);
    if (paths.length === 0) {
        list.innerHTML = '<div style="color: #64748b; font-size: 14px;">No recent courses</div>';
        return;
    }
    
    const frag = document.createDocumentFragment();
    for (const p of paths) {
        const prog = currentProgress[p];
        const videos = Object.values(prog).filter(v => typeof v === 'object' && v !== null && 'completed' in v);
        const comp = videos.filter(v => v.completed).length;
        
        let total = prog.__meta && prog.__meta.totalVideos ? prog.__meta.totalVideos : videos.length;
        let percent = total > 0 ? Math.min(Math.round((comp / total) * 100), 100) : 0;
        
        let labelText = "Start Now";
        if (percent >= 100) labelText = "Completed";
        else if (percent > 0 || videos.length > 0) labelText = "In Progress";
        
        const folderName = p.split(/[\\/]/).pop();
        
        const tile = document.createElement('div');
        tile.className = 'course-tile';
        tile.innerHTML = `
            <div class="tile-title" title="${folderName}">${folderName}</div>
            <div class="tile-stats">${percent}%</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.7)">${labelText}</div>
        `;
        tile.onclick = () => loadCourse(p);
        frag.appendChild(tile);
    }
    list.appendChild(frag);
}

document.getElementById('btn-open-course').addEventListener('click', async () => {
    const dir = await window.electronAPI.openDirectory();
    if (dir) await loadCourse(dir);
});

document.getElementById('btn-close-course').addEventListener('click', () => {
    launchScreen.classList.add('view-active');
    playerScreen.classList.remove('view-active');
    
    mainVideo.pause();
    mainVideo.removeAttribute('src');
    mainVideo.load();
    preloadVideo.removeAttribute('src');
    preloadVideo.load();
    
    currentCourse = null;
    activeVideoPath = null;
    renderRecentCourses();
});

btnToggleSidebar.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebarEl.classList.add('hidden');
    btnShowSidebar.classList.add('show');
});

btnShowSidebar.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebarEl.classList.remove('hidden');
    btnShowSidebar.classList.remove('show');
});

async function loadCourse(dirPath) {
    const courseData = await window.electronAPI.scanDirectory(dirPath);
    
    if (!courseData || !courseData.children || courseData.children.length === 0) {
        alert('Invalid course folder or no supported media found.');
        return;
    }

    if (!currentProgress[dirPath]) {
        currentProgress[dirPath] = {};
    }

    currentProgress[dirPath].__meta = {
        totalVideos: countVids(courseData.children)
    };
    
    scheduleSave(true);

    currentCourse = courseData;
    courseTitleEl.textContent = courseData.name;
    
    launchScreen.classList.remove('view-active');
    playerScreen.classList.add('view-active');

    renderSidebar();

    const resumeVid = getResumeVideo();
    if (resumeVid) playVideo(resumeVid, resumeVid.relPath, false);
}

function getResumeVideo() {
    const list = getFlatPlaylist();
    if (!list || list.length === 0) return null;
    
    let candidate = list.find(v => {
        const p = currentProgress[currentCourse.path][v.relPath];
        return p && p.time > 5 && !p.completed;
    });
    if (candidate) return candidate;

    candidate = list.find(v => {
        const p = currentProgress[currentCourse.path][v.relPath];
        return !p || !p.completed;
    });
    if (candidate) return candidate;

    return list[0];
}

function renderSidebar() {
    sidebarTree.innerHTML = '';
    
    if (!currentCourse || !currentCourse.children) return;

    const isSingleVideo = currentCourse.children.length === 1 && currentCourse.children[0].type === 'video';
    
    if (isSingleVideo) {
        sidebarEl.classList.add('hidden');
        sidebarEl.style.display = 'none';
        btnShowSidebar.style.display = 'none';
    } else {
        sidebarEl.style.display = 'flex';
        btnShowSidebar.style.display = '';
        
        const frag = document.createDocumentFragment();
        const ul = document.createElement('div');
        ul.className = 'tree-list';
        renderRecursive(ul, currentCourse.children, 1);
        frag.appendChild(ul);
        sidebarTree.appendChild(frag);
        
        if (activeVideoPath) {
            const cssSafePath = activeVideoPath.replace(/\\/g, '\\\\');
            const activeEl = sidebarTree.querySelector(`.node-video[data-path="${cssSafePath}"]`);
            if (activeEl) activeEl.classList.add('active');
        }
    }
}

function renderRecursive(container, nodes, depth) {
    let totalVideos = 0;
    let completedVideos = 0;

    const frag = document.createDocumentFragment();

    nodes.forEach(node => {
        if (node.type === 'video') {
            const relPath = pathRelative(currentCourse.path, node.path);
            const vidProg = currentProgress[currentCourse.path][relPath] || { completed: false, time: 0 };
            
            totalVideos++;
            if (vidProg.completed) completedVideos++;

            const vidEl = document.createElement('div');
            vidEl.className = 'node-header node-video';
            if (depth === 1) vidEl.classList.add('flat-video'); 
            vidEl.innerHTML = `
                <span class="icon vid-icon">${vidProg.completed ? '✔' : ' '}</span>
                <span class="title">${node.name}</span>
            `;
            vidEl.dataset.path = relPath;
            frag.appendChild(vidEl);
        } else if (node.type === 'directory') {
            const dirContainer = document.createElement('div');
            dirContainer.className = depth === 1 ? 'module-node' : 'lesson-node';
            
            const header = document.createElement('div');
            header.className = `node-header ${depth === 1 ? 'node-module' : 'node-lesson'}`;
            
            const progressSpan = document.createElement('span');
            progressSpan.className = `progress ${depth === 1 ? 'prog-mod' : 'prog-less'}`;
            
            header.innerHTML = `
                <span class="expander">▼</span>
                <span class="title">${node.name}</span>
            `;
            header.appendChild(progressSpan);

            const content = document.createElement('div');
            content.className = 'node-content';
            
            const stats = renderRecursive(content, node.children, depth + 1);
            progressSpan.textContent = `${stats.completed}/${stats.total}`;
            if (stats.total > 0 && stats.completed === stats.total) header.style.color = '#00aba9';

            dirContainer.appendChild(header);
            dirContainer.appendChild(content);
            frag.appendChild(dirContainer);

            totalVideos += stats.total;
            completedVideos += stats.completed;
        }
    });

    container.appendChild(frag);
    return { total: totalVideos, completed: completedVideos };
}

function updateNodeProgressVisuals(vidPath) {
    const cssSafePath = vidPath.replace(/\\/g, '\\\\');
    const vidEl = sidebarTree.querySelector(`.node-video[data-path="${cssSafePath}"]`);
    if (vidEl) {
        const icon = vidEl.querySelector('.vid-icon');
        if (icon) icon.textContent = '✔';
    }

    if (!currentCourse || !currentCourse.children) return;

    function calcDirStats(nodes, containerEl) {
        let total = 0;
        let comp = 0;
        nodes.forEach(node => {
            if (node.type === 'video') {
                total++;
                const rel = pathRelative(currentCourse.path, node.path);
                const p = currentProgress[currentCourse.path][rel];
                if (p && p.completed) comp++;
            } else if (node.type === 'directory') {
                const children = Array.from(containerEl.children);
                for (let el of children) {
                    if (el.classList.contains('module-node') || el.classList.contains('lesson-node')) {
                        const titleEl = el.querySelector('.node-header > .title');
                        if (titleEl && titleEl.textContent === node.name) {
                            const contentEl = el.querySelector('.node-content');
                            const stats = calcDirStats(node.children, contentEl);
                            const progSpan = el.querySelector('.node-header > .progress');
                            if (progSpan) {
                                progSpan.textContent = `${stats.comp}/${stats.total}`;
                                const header = el.querySelector('.node-header');
                                if (stats.total > 0 && stats.comp === stats.total) {
                                    header.style.color = '#00aba9';
                                }
                            }
                            total += stats.total;
                            comp += stats.comp;
                            break;
                        }
                    }
                }
            }
        });
        return { total, comp };
    }

    const treeList = sidebarTree.querySelector('.tree-list');
    if (treeList) calcDirStats(currentCourse.children, treeList);
}

function pathRelative(base, target) {
    return target.replace(base, '').replace(/^[\\\/]/, '').replace(/\\/g, '/');
}

function playVideo(videoObj, relativePath, autoplay = true) {
    const activeCurrent = sidebarTree.querySelector('.node-video.active');
    if (activeCurrent) activeCurrent.classList.remove('active');
    
    const cssSafePath = relativePath.replace(/\\/g, '\\\\');
    const newActive = sidebarTree.querySelector(`.node-video[data-path="${cssSafePath}"]`);
    if (newActive) newActive.classList.add('active');
    
    activeVideoPath = relativePath;
    currentVideoTitle.textContent = videoObj.name;
    
    const oldTrack = document.getElementById('main-track');
    if (oldTrack) oldTrack.remove();
    
    if (mainVideo.textTracks) {
        for (let i = 0; i < mainVideo.textTracks.length; i++) {
            mainVideo.textTracks[i].mode = 'disabled';
        }
    }

    mainVideo.removeAttribute('src');
    mainVideo.load();
    mainVideo.src = `file://${videoObj.path.replace(/\\/g, '/')}`;
    
    if (videoObj.subtitlePath) {
        btnCC.style.display = '';
        loadSubtitles(videoObj.subtitlePath);
    } else {
        btnCC.style.display = 'none';
    }

    preloadNextVideo();

    if (autoplay) {
        mainVideo.play().catch(e => console.error('Autoplay blocked', e));
    }
}

function preloadNextVideo() {
    const list = getFlatPlaylist();
    if (!list) return;
    const idx = list.findIndex(v => v.relPath === activeVideoPath);
    if (idx !== -1 && idx < list.length - 1) {
        const nextVid = list[idx + 1];
        preloadVideo.src = `file://${nextVid.path.replace(/\\/g, '/')}`;
    } else {
        preloadVideo.removeAttribute('src');
        preloadVideo.load();
    }
}

async function loadSubtitles(subPath) {
    const ext = subPath.split('.').pop().toLowerCase();
    let content = await window.electronAPI.readFile(subPath);
    if (!content) return;

    if (ext === 'srt') {
        content = srtToVtt(content);
    }

    const blob = new Blob([content], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    
    const newTrack = document.createElement('track');
    newTrack.id = 'main-track';
    newTrack.kind = 'subtitles';
    newTrack.srclang = 'en';
    newTrack.label = 'English';
    newTrack.default = true;
    newTrack.src = url;
    
    mainVideo.appendChild(newTrack);
    
    setTimeout(() => {
        if (mainVideo.textTracks) {
            for (let i = 0; i < mainVideo.textTracks.length; i++) {
                if (mainVideo.textTracks[i].kind === 'subtitles') {
                    mainVideo.textTracks[i].mode = 'showing';
                }
            }
        }
    }, 50);
}

function srtToVtt(srt) {
    let vtt = 'WEBVTT\n\n';
    vtt += srt.replace(/\r\n|\r/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return vtt;
}

let lastSaveTime = 0;

mainVideo.addEventListener('loadedmetadata', () => {
    if (!activeVideoPath || !currentCourse) return;
    const vidProg = currentProgress[currentCourse.path][activeVideoPath];
    if (vidProg && vidProg.time) {
        if (vidProg.time >= mainVideo.duration - 2) {
            mainVideo.currentTime = 0;
        } else {
            mainVideo.currentTime = vidProg.time;
        }
    } else {
        mainVideo.currentTime = 0;
    }
});

mainVideo.addEventListener('timeupdate', () => {
    if (!activeVideoPath || !currentCourse) return;
    const currentTime = mainVideo.currentTime;
    const duration = mainVideo.duration;
    
    if (Math.abs(currentTime - lastSaveTime) >= CONST.TIME_UPDATE_THROTTLE_MS / 1000) {
        lastSaveTime = currentTime;
        updateProgress(activeVideoPath, currentTime, duration, false);
    }
});

mainVideo.addEventListener('ended', () => {
    if (!activeVideoPath) return;
    updateProgress(activeVideoPath, mainVideo.duration, mainVideo.duration, true);
    playNextVideo();
});

mainVideo.addEventListener('play', () => btnPlayPause.innerHTML = ICON_PAUSE);
mainVideo.addEventListener('pause', () => btnPlayPause.innerHTML = ICON_PLAY);

function updateProgress(relPath, time, duration, isEnded = false) {
    if (!currentProgress[currentCourse.path]) return;
    
    let vidProg = currentProgress[currentCourse.path][relPath];
    if (!vidProg) {
        vidProg = { time: 0, completed: false };
        currentProgress[currentCourse.path][relPath] = vidProg;
    }

    vidProg.time = time;
    let markCompleted = false;
    
    if (duration > 0 && (time / duration) >= CONST.COMPLETION_THRESHOLD || isEnded) {
        if (!vidProg.completed) {
            vidProg.completed = true;
            markCompleted = true;
            updateNodeProgressVisuals(relPath);
        }
    }

    scheduleSave(markCompleted || isEnded);
}

function buildFlatPlaylist(nodes) {
    let list = [];
    for (let p=0; p < nodes.length; p++){
        let n = nodes[p];
        if (n.type === 'video') list.push({ ...n, relPath: pathRelative(currentCourse.path, n.path) });
        else if (n.type === 'directory') list = list.concat(buildFlatPlaylist(n.children));
    }
    return list;
}

function getFlatPlaylist() {
    if (!currentCourse || !currentCourse.children) return [];
    return buildFlatPlaylist(currentCourse.children);
}

function playNextVideo() {
    const list = getFlatPlaylist();
    const idx = list.findIndex(v => v.relPath === activeVideoPath);
    if (idx !== -1 && idx < list.length - 1) {
        const nextVid = list[idx + 1];
        playVideo(nextVid, nextVid.relPath);
    }
}

function playPrevVideo() {
    const list = getFlatPlaylist();
    const idx = list.findIndex(v => v.relPath === activeVideoPath);
    if (idx > 0) {
        const prevVid = list[idx - 1];
        playVideo(prevVid, prevVid.relPath);
    }
}

btnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    playNextVideo();
});

btnPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    playPrevVideo();
});

function skipTime(seconds) {
    if (!mainVideo || isNaN(mainVideo.duration)) return;
    let newTime = mainVideo.currentTime + seconds;
    if (newTime < 0) newTime = 0;
    else if (newTime > mainVideo.duration) newTime = mainVideo.duration;
    mainVideo.currentTime = newTime;
}

if (btnSkipBack) btnSkipBack.addEventListener('click', (e) => { e.stopPropagation(); skipTime(-CONST.SKIP_SECONDS); });
if (btnSkipForward) btnSkipForward.addEventListener('click', (e) => { e.stopPropagation(); skipTime(CONST.SKIP_SECONDS); });

btnPlayPause.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mainVideo.paused) mainVideo.play();
    else mainVideo.pause();
});

btnCC.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mainVideo.textTracks) {
        for (let i = 0; i < mainVideo.textTracks.length; i++) {
            const track = mainVideo.textTracks[i];
            if (track.kind === 'subtitles') {
                track.mode = track.mode === 'showing' ? 'hidden' : 'showing';
            }
        }
    }
});

btnFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
        videoContainer.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
});

videoContainer.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) btnFullscreen.innerHTML = '&#xE1D8;';
    else btnFullscreen.innerHTML = '&#xE1D9;';
});

document.getElementById('playback-speed').addEventListener('change', (e) => {
    e.stopPropagation();
    mainVideo.playbackRate = parseFloat(e.target.value);
});

document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    if (activeEl && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeEl.tagName) || activeEl.isContentEditable) {
        return;
    }
    
    if (!playerScreen.classList.contains('view-active')) return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            if (mainVideo.paused) mainVideo.play();
            else mainVideo.pause();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            skipTime(e.shiftKey ? -CONST.SKIP_SECONDS_MODIFIER : -CONST.SKIP_SECONDS);
            showOverlay();
            break;
        case 'ArrowRight':
            e.preventDefault();
            skipTime(e.shiftKey ? CONST.SKIP_SECONDS_MODIFIER : CONST.SKIP_SECONDS);
            showOverlay();
            break;
    }
});

function showOverlay() {
    videoContainer.classList.add('active-overlay');
    clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => {
        if (!mainVideo.paused) {
            videoContainer.classList.remove('active-overlay');
        }
    }, CONST.OVERLAY_TIMEOUT_MS);
}

videoContainer.addEventListener('mousemove', showOverlay);
videoContainer.addEventListener('click', showOverlay);
mainVideo.addEventListener('pause', showOverlay);
mainVideo.addEventListener('play', showOverlay);

init();
