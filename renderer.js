let currentCourse = null;
let currentProgress = {};
let activeVideoPath = null;
let overlayTimeout = null;

// DOM Elements
const launchScreen = document.getElementById('launch-screen');
const playerScreen = document.getElementById('player-screen');
const sidebarTree = document.getElementById('sidebar-tree');
const courseTitleEl = document.getElementById('course-title');
const mainVideo = document.getElementById('main-video');
const currentVideoTitle = document.getElementById('current-video-title');
const mainTrack = document.getElementById('main-track');
const videoContainer = document.getElementById('video-container');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnCC = document.getElementById('btn-cc');

// Icons (Segoe MDL2 basic mappings)
const ICON_PLAY = '&#xE102;';
const ICON_PAUSE = '&#xE103;';

// Window Controls
document.getElementById('btn-win-min').addEventListener('click', () => {
    window.electronAPI.windowMinimize();
});
document.getElementById('btn-win-max').addEventListener('click', () => {
    window.electronAPI.windowMaximize();
});
document.getElementById('btn-win-close').addEventListener('click', () => {
    window.electronAPI.windowClose();
});

async function init() {
    currentProgress = await window.electronAPI.readStore();
    renderRecentCourses();
    initAsciiCircle();
}

const asciiChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*()_+{}[]|:;"<>,.?/~`';
const bgAsciiEl = document.getElementById('launch-bg-ascii');
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
    }, 150);
}

async function renderRecentCourses() {
    const list = document.getElementById('recent-courses-list');
    list.innerHTML = '';
    const paths = Object.keys(currentProgress);
    if (paths.length === 0) {
        list.innerHTML = '<div style="color: #64748b; font-size: 14px;">No recent courses</div>';
        return;
    }
    
    for (const p of paths) {
        const prog = currentProgress[p];
        
        // Resolve missing metadata quietly if course still exists
        if (!prog.__meta || prog.__meta.totalVideos === undefined) {
            const cData = await window.electronAPI.scanDirectory(p);
            if (cData && cData.children) {
                function countVids(nodes) {
                    let cnt = 0;
                    nodes.forEach(n => {
                        if (n.type === 'video') cnt++;
                        else if (n.type === 'directory') cnt += countVids(n.children);
                    });
                    return cnt;
                }
                if (!prog.__meta) prog.__meta = {};
                prog.__meta.totalVideos = countVids(cData.children);
                // Automatically save the refreshed metadata
                window.electronAPI.writeStore(currentProgress);
            }
        }

        const videos = Object.values(prog).filter(v => typeof v === 'object' && v !== null && 'completed' in v);
        const comp = videos.filter(v => v.completed).length;
        
        let total = prog.__meta && prog.__meta.totalVideos ? prog.__meta.totalVideos : 0;
        let percent = 0;
        
        // Calculate strictly against the total physical files found
        if (total > 0) {
            percent = Math.min(Math.round((comp / total) * 100), 100);
        } else if (videos.length > 0) {
            // Unlikely fallback if drive is detached 
            percent = Math.min(Math.round((comp / Math.max(videos.length, 1)) * 100), 100);
        }
        
        let labelText = "Start Now";
        if (percent >= 100) {
            labelText = "Completed";
        } else if (percent > 0 || videos.length > 0) {
            labelText = "In Progress";
        }
        
        const folderName = p.split(/[\\/]/).pop();
        
        const tile = document.createElement('div');
        tile.className = 'course-tile';
        
        tile.innerHTML = `
            <div class="tile-title" title="${folderName}">${folderName}</div>
            <div class="tile-stats">${percent}%</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.7)">${labelText}</div>
        `;
        tile.onclick = () => loadCourse(p);
        list.appendChild(tile);
    }
}

document.getElementById('btn-open-course').addEventListener('click', async () => {
    const dir = await window.electronAPI.openDirectory();
    if (dir) {
        await loadCourse(dir);
    }
});

document.getElementById('btn-close-course').addEventListener('click', () => {
    launchScreen.classList.add('view-active');
    playerScreen.classList.remove('view-active');
    mainVideo.pause();
    mainVideo.src = '';
    mainTrack.src = '';
    currentCourse = null;
    activeVideoPath = null;
    renderRecentCourses();
});

const sidebarEl = document.getElementById('sidebar');
const btnShowSidebar = document.getElementById('btn-show-sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');

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

    function countVids(nodes) {
        let cnt = 0;
        nodes.forEach(n => {
            if (n.type === 'video') cnt++;
            else if (n.type === 'directory') cnt += countVids(n.children);
        });
        return cnt;
    }

    currentProgress[dirPath].__meta = {
        totalVideos: countVids(courseData.children)
    };
    
    await saveProgress();

    currentCourse = courseData;
    courseTitleEl.textContent = courseData.name;
    
    launchScreen.classList.remove('view-active');
    playerScreen.classList.add('view-active');

    renderSidebar();

    const resumeVid = getResumeVideo();
    if (resumeVid) {
        playVideo(resumeVid, resumeVid.relPath, false);
    }
}

function getResumeVideo() {
    const list = getFlatPlaylist();
    if (!list || list.length === 0) return null;
    
    // First, try to find a partially watched video
    let candidate = list.find(v => {
        const p = currentProgress[currentCourse.path][v.relPath];
        return p && p.time > 5 && !p.completed;
    });
    if (candidate) return candidate;

    // Then, find the first fully unwatched video
    candidate = list.find(v => {
        const p = currentProgress[currentCourse.path][v.relPath];
        return !p || !p.completed;
    });
    if (candidate) return candidate;

    // If all completed, return first video
    return list[0];
}

function renderRecursive(container, nodes, depth) {
    let totalVideos = 0;
    let completedVideos = 0;

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
            vidEl.onclick = () => playVideo(node, relPath);
            vidEl.dataset.path = relPath;
            container.appendChild(vidEl);
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
            header.onclick = () => {
                content.style.display = content.style.display === 'none' ? 'block' : 'none';
                header.querySelector('.expander').textContent = content.style.display === 'none' ? '▷' : '▼';
            };

            const stats = renderRecursive(content, node.children, depth + 1);
            
            progressSpan.textContent = `${stats.completed}/${stats.total}`;
            if (stats.total > 0 && stats.completed === stats.total) header.style.color = '#00aba9';

            dirContainer.appendChild(header);
            dirContainer.appendChild(content);
            container.appendChild(dirContainer);

            totalVideos += stats.total;
            completedVideos += stats.completed;
        }
    });

    return { total: totalVideos, completed: completedVideos };
}

function renderSidebar() {
    sidebarTree.innerHTML = '';
    
    if (!currentCourse || !currentCourse.children) return;

    // Check Single Video Mode
    const isSingleVideo = currentCourse.children.length === 1 && currentCourse.children[0].type === 'video';
    
    if (isSingleVideo) {
        sidebarEl.classList.add('hidden');
        sidebarEl.style.display = 'none';
        btnShowSidebar.style.display = 'none';
    } else {
        sidebarEl.style.display = 'flex';
        btnShowSidebar.style.display = '';
        
        const ul = document.createElement('div');
        ul.className = 'tree-list';
        renderRecursive(ul, currentCourse.children, 1);
        sidebarTree.appendChild(ul);
        
        if (activeVideoPath) {
            const elList = Array.from(document.querySelectorAll('.node-video'));
            const activeEl = elList.find(el => el.dataset.path === activeVideoPath);
            if (activeEl) {
                activeEl.classList.add('active');
            }
        }
    }
}

function updateNodeProgressVisuals(vidPath) {
    const elList = Array.from(document.querySelectorAll('.node-video'));
    const vidEl = elList.find(el => el.dataset.path === vidPath);
    if (vidEl) {
        vidEl.querySelector('.vid-icon').textContent = '✔';
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
                const dirEls = Array.from(containerEl.children).filter(el => el.classList.contains('module-node') || el.classList.contains('lesson-node'));
                const dirEl = dirEls.find(el => {
                    const titleEl = el.querySelector(':scope > .node-header > .title');
                    return titleEl && titleEl.textContent === node.name;
                });
                
                if (dirEl) {
                    const contentEl = dirEl.querySelector(':scope > .node-content');
                    const stats = calcDirStats(node.children, contentEl);
                    const progSpan = dirEl.querySelector(':scope > .node-header > .progress');
                    if (progSpan) {
                        progSpan.textContent = `${stats.comp}/${stats.total}`;
                        const header = dirEl.querySelector(':scope > .node-header');
                        if (stats.total > 0 && stats.comp === stats.total) {
                            header.style.color = '#00aba9';
                        }
                    }
                    total += stats.total;
                    comp += stats.comp;
                }
            }
        });
        return { total, comp };
    }

    const treeList = sidebarTree.querySelector('.tree-list');
    if (treeList) {
        calcDirStats(currentCourse.children, treeList);
    }
}

function pathRelative(base, target) {
    return target.replace(base, '').replace(/^[\\\/]/, '').replace(/\\/g, '/');
}

async function saveProgress() {
    await window.electronAPI.writeStore(currentProgress);
}

function playVideo(videoObj, relativePath, autoplay = true) {
    document.querySelectorAll('.node-video').forEach(el => el.classList.remove('active'));
    
    const elList = Array.from(document.querySelectorAll('.node-video'));
    const activeEl = elList.find(el => el.dataset.path === relativePath);
    if (activeEl) activeEl.classList.add('active');
    
    activeVideoPath = relativePath;
    currentVideoTitle.textContent = videoObj.name;
    
    const oldTrack = document.getElementById('main-track');
    if (oldTrack) oldTrack.remove();
    
    // Explicitly disable any ghost textTracks in HTML5
    if (mainVideo.textTracks) {
        for (let i = 0; i < mainVideo.textTracks.length; i++) {
            mainVideo.textTracks[i].mode = 'disabled';
        }
    }

    mainVideo.src = `file://${videoObj.path.replace(/\\/g, '/')}`;
    
    if (videoObj.subtitlePath) {
        btnCC.style.display = '';
        loadSubtitles(videoObj.subtitlePath);
    } else {
        btnCC.style.display = 'none';
    }

    if (autoplay) {
        // Time is resumed in 'loadedmetadata' listener to ensure duration is known
        mainVideo.play().catch(e => console.log('Autoplay blocked', e));
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
    
    // Ensure display mode takes securely
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
    vtt += srt.replace(/\r\n|\r/g, '\n')
              .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return vtt;
}

let lastSaveTime = 0;

mainVideo.addEventListener('loadedmetadata', () => {
    if (!activeVideoPath || !currentCourse) return;
    const vidProg = currentProgress[currentCourse.path][activeVideoPath];
    if (vidProg && vidProg.time) {
        // If it's basically at the end, restart from 0
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
    
    if (Math.abs(currentTime - lastSaveTime) >= 5) {
        lastSaveTime = currentTime;
        updateProgress(activeVideoPath, currentTime, duration, false);
    }
});

mainVideo.addEventListener('ended', () => {
    if (!activeVideoPath) return;
    updateProgress(activeVideoPath, mainVideo.duration, mainVideo.duration, true);
    playNextVideo();
});

mainVideo.addEventListener('play', () => {
    btnPlayPause.innerHTML = ICON_PAUSE;
});
mainVideo.addEventListener('pause', () => {
    btnPlayPause.innerHTML = ICON_PLAY;
});

function updateProgress(relPath, time, duration, isEnded = false) {
    if (!currentProgress[currentCourse.path]) return;
    
    let vidProg = currentProgress[currentCourse.path][relPath];
    if (!vidProg) {
        vidProg = { time: 0, completed: false };
        currentProgress[currentCourse.path][relPath] = vidProg;
    }

    vidProg.time = time;
    
    if (duration > 0 && (time / duration) >= 0.9 || isEnded) {
        if (!vidProg.completed) {
            vidProg.completed = true;
            
            const elList = Array.from(document.querySelectorAll('.node-video'));
            const vidEl = elList.find(el => el.dataset.path === relPath);
            if (vidEl) {
                updateNodeProgressVisuals(relPath);
            }
        }
    }

    saveProgress();
}

function buildFlatPlaylist(nodes) {
    let list = [];
    nodes.forEach(n => {
        if (n.type === 'video') {
            list.push({ ...n, relPath: pathRelative(currentCourse.path, n.path) });
        } else if (n.type === 'directory') {
            list = list.concat(buildFlatPlaylist(n.children));
        }
    });
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

btnPlayPause.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mainVideo.paused) {
        mainVideo.play();
    } else {
        mainVideo.pause();
    }
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
        videoContainer.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});

videoContainer.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        btnFullscreen.innerHTML = '&#xE1D8;'; // Exit Fullscreen
    } else {
        btnFullscreen.innerHTML = '&#xE1D9;'; // Enter Fullscreen
    }
});

document.getElementById('playback-speed').addEventListener('change', (e) => {
    e.stopPropagation();
    mainVideo.playbackRate = parseFloat(e.target.value);
});

function srtToVtt(srt) {
    let vtt = 'WEBVTT\n\n';
    vtt += srt.replace(/\r\n|\r/g, '\n')
              .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return vtt;
}

// Overlay Autohide Logic
function showOverlay() {
    videoContainer.classList.add('active-overlay');
    clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => {
        if (!mainVideo.paused) { // only hide if playing
            videoContainer.classList.remove('active-overlay');
        }
    }, 2500);
}

videoContainer.addEventListener('mousemove', showOverlay);
videoContainer.addEventListener('click', showOverlay);
mainVideo.addEventListener('pause', showOverlay); // keep open while paused
mainVideo.addEventListener('play', showOverlay);

init();
