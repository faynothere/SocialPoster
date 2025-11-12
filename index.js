import { getContext, eventSource, event_types, saveSettingsDebounced } from '../../../script.js';
import { extension_settings, renderExtensionTemplate, getRequestHeaders } from '../../extensions.js';
import { callGenericPopup, callConfirm } from '../../../../script.js';

// ตั้งค่าเริ่มต้น
const defaultSettings = {
    enabled: true,
    autoPostFrequency: 3,
    enabledPlatforms: ['twitter', 'facebook', 'instagram'],
    maxPosts: 20,
    enableNotifications: true,
    posts: []
};

const extensionName = 'socialMediaPosts';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// ข้อมูลแพลตฟอร์มและเทมเพลต
const platforms = {
    'twitter': { name: 'Twitter', icon: '🐦', maxLength: 280 },
    'facebook': { name: 'Facebook', icon: '📘', maxLength: 5000 },
    'instagram': { name: 'Instagram', icon: '📷', maxLength: 2200 },
    'threads': { name: 'Threads', icon: '🧵', maxLength: 500 }
};

const postTemplates = {
    reflective: [
        "คิดเกี่ยวกับเรื่องนี้มาตลอด... {{context}}",
        "บางครั้งก็สงสัยว่า... {{context}}",
        "ได้บทเรียนใหม่จากเรื่องนี้... {{context}}"
    ],
    emotional: [
        "รู้สึกแบบนี้จริงๆ... {{context}}",
        "วันนี้ emotions มันพลุ่งพล่าน... {{context}}",
        "ไม่คิดว่าจะรู้สึกแบบนี้ได้... {{context}}"
    ],
    casual: [
        "แชร์เรื่องเล็กๆ น้อยๆ... {{context}}",
        "ชีวิตประจำวัน... {{context}}",
        "เพิ่งเจอเรื่องแบบนี้... {{context}}"
    ],
    dramatic: [
        "ไม่น่าเชื่อว่าจะเกิดเรื่องแบบนี้! {{context}}",
        "เรื่องน่าตกใจเกิดขึ้น... {{context}}",
        "ตอนนี้กำลังเกิดขึ้น... {{context}}"
    ]
};

let messageCounter = 0;
let isInitialized = false;

// ฟังก์ชันโหลดการตั้งค่า
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = value;
        }
    }
    
    const savedPosts = localStorage.getItem(`${extensionName}_posts`);
    if (savedPosts) {
        extension_settings[extensionName].posts = JSON.parse(savedPosts);
    }
}

// บันทึกการตั้งค่า
function saveSettings() {
    localStorage.setItem(`${extensionName}_posts`, JSON.stringify(extension_settings[extensionName].posts));
    saveSettingsDebounced();
}

// สร้างปุ่มใน extension menu
function createMenuButton() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) return;

    const menuItem = document.createElement('div');
    menuItem.className = 'extensions-menu-item';
    menuItem.innerHTML = `
        <div class="menu-button" data-ext="${extensionName}">
            <i class="fa-solid fa-square-share-nodes"></i>
            <span>Social Media Posts</span>
        </div>
    `;

    extensionsMenu.appendChild(menuItem);
    
    // เพิ่ม event listener
    menuItem.addEventListener('click', () => {
        openSocialMediaPanel();
    });
}

// เปิด panel หลัก
async function openSocialMediaPanel() {
    // ปิด panel อื่นๆ ที่เปิดอยู่
    closeAllExtensionPanels();
    
    // สร้าง panel หลัก
    const panel = document.createElement('div');
    panel.id = 'socialMediaMainPanel';
    panel.className = 'social-media-main-panel';
    
    try {
        const template = await renderExtensionTemplate(extensionFolderPath, 'template.html', {
            settings: extension_settings[extensionName],
            platforms: platforms,
            postTemplates: postTemplates
        });
        
        panel.innerHTML = template;
        document.getElementById('extensions_settings').appendChild(panel);
        attachPanelEventListeners();
        updatePostsFeed();
        
        // แสดง panel
        panel.style.display = 'block';
        
    } catch (error) {
        console.error('Error opening social media panel:', error);
        toastr.error('Failed to load Social Media Posts panel');
    }
}

// ปิด panel ทั้งหมด
function closeAllExtensionPanels() {
    const panels = document.querySelectorAll('.extension-panel, .social-media-main-panel');
    panels.forEach(panel => {
        panel.remove();
    });
}

// ผูก event listeners ใน panel
function attachPanelEventListeners() {
    // Toggle extension
    const toggle = document.getElementById('socialMediaToggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            extension_settings[extensionName].enabled = e.target.checked;
            saveSettings();
            toastr.success(`Social Media Posts ${e.target.checked ? 'enabled' : 'disabled'}`);
        });
    }

    // Create post button
    const createBtn = document.getElementById('createPostBtn');
    if (createBtn) {
        createBtn.addEventListener('click', createManualPost);
    }

    // Auto-post frequency
    const freqInput = document.getElementById('autoPostFreq');
    if (freqInput) {
        freqInput.addEventListener('change', (e) => {
            extension_settings[extensionName].autoPostFrequency = parseInt(e.target.value);
            saveSettings();
        });
    }

    // Platform checkboxes
    document.querySelectorAll('.platform-checkboxes input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateEnabledPlatforms);
    });

    // Clear posts button
    const clearBtn = document.getElementById('clearPostsBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllPosts);
    }

    // Close button
    const closeBtn = document.getElementById('socialMediaCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAllExtensionPanels);
    }
}

// อัพเดตแพลตฟอร์มที่เปิดใช้งาน
function updateEnabledPlatforms() {
    const enabled = [];
    document.querySelectorAll('.platform-checkboxes input[type="checkbox"]:checked').forEach(checkbox => {
        enabled.push(checkbox.value);
    });
    extension_settings[extensionName].enabledPlatforms = enabled;
    saveSettings();
}

// สร้างโพสต์ manual
async function createManualPost() {
    if (!extension_settings[extensionName].enabled) {
        toastr.warning('Please enable the extension first');
        return;
    }

    const platformSelect = document.getElementById('postPlatform');
    const templateSelect = document.getElementById('postTemplate');
    
    if (!platformSelect || !templateSelect) {
        console.error('Form elements not found');
        return;
    }

    const platform = platformSelect.value;
    const templateType = templateSelect.value;
    
    const post = generatePost(platform, templateType);
    addNewPost(post);
    showPostNotification(post);
}

// สร้างโพสต์
function generatePost(platform, templateType = 'random') {
    const recentChat = getRecentChatContext(3);
    const context = extractPostContext(recentChat);
    const charName = getCurrentCharName();
    
    const actualTemplateType = templateType === 'random' ? getRandomTemplateType() : templateType;
    let content = generatePostContent(context, actualTemplateType);
    
    const maxLength = platforms[platform].maxLength;
    if (content.length > maxLength) {
        content = content.substring(0, maxLength - 3) + '...';
    }
    
    if (platform === 'instagram' || platform === 'twitter') {
        content += generateHashtags();
    }

    return {
        id: Date.now(),
        content: content,
        platform: platform,
        platformName: platforms[platform].name,
        platformIcon: platforms[platform].icon,
        character: charName,
        timestamp: new Date().toLocaleString('th-TH'),
        likes: Math.floor(Math.random() * 100),
        comments: Math.floor(Math.random() * 20),
        shares: Math.floor(Math.random() * 10),
        template: actualTemplateType
    };
}

// สร้างเนื้อหาโพสต์
function generatePostContent(context, templateType) {
    const templates = postTemplates[templateType];
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('{{context}}', context);
}

// ดึง context จากบทสนทนา
function extractPostContext(recentChat) {
    if (recentChat.length === 0) {
        return "มีเรื่องราวน่าสนใจเกิดขึ้น...";
    }

    const lastUserMsg = recentChat.find(msg => msg.is_user);
    const lastCharMsg = recentChat.find(msg => !msg.is_user);

    if (lastUserMsg && lastCharMsg) {
        return `หลังจากที่ ${lastUserMsg.name} พูดว่า "${shortenText(lastUserMsg.mes, 60)}" ทำให้รู้สึกว่า "${shortenText(lastCharMsg.mes, 80)}"`;
    } else if (lastCharMsg) {
        return shortenText(lastCharMsg.mes, 120);
    }

    return "กำลังคิดเกี่ยวกับเรื่องที่เกิดขึ้น...";
}

// สุ่ม hashtag
function generateHashtags() {
    const hashtags = [
        ' #ชีวิตประจำวัน', ' #ความคิด', ' #ความรู้สึก', 
        ' #เรื่องราว', ' #บทสนทนา', ' #RPG'
    ];
    return hashtags[Math.floor(Math.random() * hashtags.length)];
}

// สุ่มประเภท template
function getRandomTemplateType() {
    const types = Object.keys(postTemplates);
    return types[Math.floor(Math.random() * types.length)];
}

// สุ่มแพลตฟอร์ม
function getRandomPlatform() {
    const enabled = extension_settings[extensionName].enabledPlatforms;
    if (enabled.length === 0) return 'twitter';
    return enabled[Math.floor(Math.random() * enabled.length)];
}

// เพิ่มโพสต์ใหม่
function addNewPost(post) {
    if (!extension_settings[extensionName].posts) {
        extension_settings[extensionName].posts = [];
    }
    
    extension_settings[extensionName].posts.unshift(post);
    
    if (extension_settings[extensionName].posts.length > extension_settings[extensionName].maxPosts) {
        extension_settings[extensionName].posts = extension_settings[extensionName].posts.slice(0, extension_settings[extensionName].maxPosts);
    }
    
    saveSettings();
    updatePostsFeed();
}

// อัพเดตฟีดโพสต์
function updatePostsFeed() {
    const feed = document.getElementById('postsFeed');
    if (feed) {
        feed.innerHTML = renderPostsFeed();
    }
}

// เรนเดอร์ฟีดโพสต์
function renderPostsFeed() {
    const posts = extension_settings[extensionName].posts || [];
    
    if (posts.length === 0) {
        return '<div class="no-posts">ยังไม่มีโพสต์</div>';
    }

    return posts.map(post => `
        <div class="social-post ${post.platform}" data-post-id="${post.id}">
            <div class="post-header">
                <span class="platform-icon">${post.platformIcon}</span>
                <span class="platform-name">${post.platformName}</span>
                <span class="post-time">${post.timestamp}</span>
            </div>
            <div class="post-content">${post.content}</div>
            <div class="post-stats">
                <span>👍 ${post.likes}</span>
                <span>💬 ${post.comments}</span>
                <span>🔄 ${post.shares}</span>
                <span class="post-char">โดย ${post.character}</span>
            </div>
        </div>
    `).join('');
}

// แสดงการแจ้งเตือน
function showPostNotification(post) {
    if (!extension_settings[extensionName].enableNotifications) return;

    if (typeof toastr !== 'undefined') {
        toastr.success(`New post on ${post.platformName}!`, "Social Media Posts", {
            timeOut: 3000,
            extendedTimeOut: 1000
        });
    }
}

// ฟังก์ชัน utility
function getRecentChatContext(messageCount) {
    const context = getContext();
    return context.chat?.slice(-messageCount) || [];
}

function getCurrentCharName() {
    const context = getContext();
    return context.characters[context.characterId]?.name || "{{char}}";
}

function shortenText(text, maxLength) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

// ล้างโพสต์ทั้งหมด
async function clearAllPosts() {
    const confirmed = await callConfirm('Are you sure you want to clear all posts? This action cannot be undone.');
    if (confirmed) {
        extension_settings[extensionName].posts = [];
        saveSettings();
        updatePostsFeed();
        toastr.info('All posts have been cleared');
    }
}

// ตรวจจับการส่งข้อความ
function onChatMessageSent() {
    if (!extension_settings[extensionName]?.enabled) return;
    
    messageCounter++;
    
    if (messageCounter >= extension_settings[extensionName].autoPostFrequency) {
        setTimeout(() => {
            const platform = getRandomPlatform();
            const post = generatePost(platform, 'random');
            addNewPost(post);
            showPostNotification(post);
        }, 2000);
        messageCounter = 0;
    }
}

// ตรวจจับการตอบกลับของ AI
function onAiResponseGenerated() {
    if (!extension_settings[extensionName]?.enabled) return;
    
    const context = getContext();
    const lastMessage = context.chat?.[context.chat.length - 1];
    
    if (lastMessage && !lastMessage.is_user) {
        const response = lastMessage.mes;
        if (shouldCreatePostFromResponse(response)) {
            if (Math.random() > 0.6) {
                setTimeout(() => {
                    const platform = getRandomPlatform();
                    const context = shortenText(response, 100);
                    const charName = getCurrentCharName();
                    
                    const post = {
                        id: Date.now(),
                        content: `รู้สึกแบบนี้เลย... "${context}"`,
                        platform: platform,
                        platformName: platforms[platform].name,
                        platformIcon: platforms[platform].icon,
                        character: charName,
                        timestamp: new Date().toLocaleString('th-TH'),
                        likes: Math.floor(Math.random() * 100),
                        comments: Math.floor(Math.random() * 20),
                        shares: Math.floor(Math.random() * 10),
                        template: 'emotional'
                    };
                    
                    addNewPost(post);
                    showPostNotification(post);
                }, 3000);
            }
        }
    }
}

function shouldCreatePostFromResponse(response) {
    if (!response) return false;
    
    const emotionalIndicators = [
        'รู้สึก', 'คิดว่า', 'ไม่น่าเชื่อ', 'ประหลาดใจ', 'สุขใจ', 'เสียใจ',
        'โกรธ', 'กลัว', 'รัก', 'เกลียด', 'ตื่นเต้น', 'ดีใจ', 'เสียดาย'
    ];
    
    return emotionalIndicators.some(indicator => 
        response.toLowerCase().includes(indicator.toLowerCase())
    ) || response.length > 80;
}

// เริ่มต้น extension
jQuery(async () => {
    if (isInitialized) return;
    
    let attempts = 0;
    const maxAttempts = 50;
    
    const waitForLoad = setInterval(() => {
        attempts++;
        
        if (getContext() && extension_settings) {
            clearInterval(waitForLoad);
            loadSettings();
            createMenuButton();
            
            // ลงทะเบียน event listeners
            eventSource.on(event_types.MESSAGE_SENT, onChatMessageSent);
            eventSource.on(event_types.MESSAGE_RECEIVED, onAiResponseGenerated);
            
            isInitialized = true;
            console.log('📱 Social Media Posts Extension loaded successfully!');
        } else if (attempts >= maxAttempts) {
            clearInterval(waitForLoad);
            console.error('Social Media Posts Extension: Failed to load - SillyTavern context not found');
        }
    }, 100);
});

// Export สำหรับ testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generatePost,
        extractPostContext,
        loadSettings,
        saveSettings
    };
                         }
