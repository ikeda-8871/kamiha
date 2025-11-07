// Global state
let cardData = null;
let packs = [];
let cards = [];
let currentDeck = []; // Deck state: array of card objects (max 9)

// Type labels
const TYPE_LABEL = {
    0: "キャラクター",
    1: "能力"
};

// Deck building rules
const DECK_RULES = {
    maxCards: 9,
    allowedTypes: [0] // Only type 0 (Character) cards allowed
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadCardData();
    setupEventListeners();
    loadDeckFromStorage();
    initializeDeckBuilder();
});

// Load card data from JSON
async function loadCardData() {
    try {
        const response = await fetch('data/cards.json');
        if (!response.ok) {
            throw new Error('Failed to load card data');
        }
        cardData = await response.json();
        packs = cardData.packs || [];
        cards = cardData.cards || [];
        console.log(`Loaded ${cards.length} cards from ${packs.length} packs`);
    } catch (error) {
        console.error('Error loading card data:', error);
        alert('カードデータの読み込みに失敗しました。data/cards.jsonが存在することを確認してください。');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Deck builder event listeners
    document.getElementById('clear-deck-btn').addEventListener('click', clearDeck);
    document.getElementById('export-deck-btn').addEventListener('click', exportDeck);
    document.getElementById('import-deck-btn').addEventListener('click', importDeck);
    document.getElementById('save-image-btn').addEventListener('click', saveDeckAsImage);
    document.getElementById('deck-search').addEventListener('input', filterCharacters);
    document.getElementById('deck-pack-filter').addEventListener('change', filterCharacters);
    document.getElementById('deck-cost-min').addEventListener('change', filterCharacters);
    document.getElementById('deck-cost-max').addEventListener('change', filterCharacters);
    document.getElementById('deck-power-min').addEventListener('change', filterCharacters);
    document.getElementById('deck-power-max').addEventListener('change', filterCharacters);
    document.getElementById('deck-ability-filter').addEventListener('change', filterCharacters);

    // Export modal event listeners
    document.getElementById('close-export-modal-btn').addEventListener('click', closeExportModal);
    document.getElementById('copy-export-code-btn').addEventListener('click', copyExportDeckCode);
    document.getElementById('deck-code-export-modal').addEventListener('click', (e) => {
        if (e.target.id === 'deck-code-export-modal') {
            closeExportModal();
        }
    });

    // Import modal event listeners
    document.getElementById('close-import-modal-btn').addEventListener('click', closeImportModal);
    document.getElementById('import-code-btn').addEventListener('click', processImportDeckCode);
    document.getElementById('deck-code-import-modal').addEventListener('click', (e) => {
        if (e.target.id === 'deck-code-import-modal') {
            closeImportModal();
        }
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// DECK BUILDER FUNCTIONS
// ============================================

// Initialize deck builder
function initializeDeckBuilder() {
    if (!cardData) return;

    populateFilters();
    displayCharacterList();
    updateDeckDisplay();
}

// Populate all filter dropdowns
function populateFilters() {
    // Pack filter
    const packFilter = document.getElementById('deck-pack-filter');
    packFilter.innerHTML = '<option value="">全てのパック</option>';
    packs.forEach((pack, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `[${index.toString().padStart(2, '0')}] ${pack}`;
        packFilter.appendChild(option);
    });

    // Cost filters - Get unique cost values from character cards
    const costs = new Set();
    cards.filter(c => c.type === 0).forEach(card => {
        if (card.cost !== null && card.cost !== undefined) {
            costs.add(card.cost);
        }
    });
    const sortedCosts = [...costs].sort((a, b) => a - b);

    const costMinFilter = document.getElementById('deck-cost-min');
    const costMaxFilter = document.getElementById('deck-cost-max');
    costMinFilter.innerHTML = '<option value="">最小</option>';
    costMaxFilter.innerHTML = '<option value="">最大</option>';

    sortedCosts.forEach(cost => {
        const optionMin = document.createElement('option');
        optionMin.value = cost;
        optionMin.textContent = cost;
        costMinFilter.appendChild(optionMin);

        const optionMax = document.createElement('option');
        optionMax.value = cost;
        optionMax.textContent = cost;
        costMaxFilter.appendChild(optionMax);
    });

    // Power filters - 0 to 8+
    const powerMinFilter = document.getElementById('deck-power-min');
    const powerMaxFilter = document.getElementById('deck-power-max');
    powerMinFilter.innerHTML = '<option value="">最小</option>';
    powerMaxFilter.innerHTML = '<option value="">最大</option>';

    for (let i = 0; i <= 8; i++) {
        const optionMin = document.createElement('option');
        optionMin.value = i;
        optionMin.textContent = i;
        powerMinFilter.appendChild(optionMin);

        const optionMax = document.createElement('option');
        optionMax.value = i;
        optionMax.textContent = i;
        powerMaxFilter.appendChild(optionMax);
    }

    // Add 8+ option
    const optionMin8Plus = document.createElement('option');
    optionMin8Plus.value = 9;
    optionMin8Plus.textContent = '8+';
    powerMinFilter.appendChild(optionMin8Plus);

    const optionMax8Plus = document.createElement('option');
    optionMax8Plus.value = 9;
    optionMax8Plus.textContent = '8+';
    powerMaxFilter.appendChild(optionMax8Plus);

    // Ability filter
    const abilityFilter = document.getElementById('deck-ability-filter');
    const abilities = new Set();
    cards.filter(c => c.type === 0).forEach(card => {
        if (card.abilities && card.abilities.length > 0) {
            card.abilities.forEach(ability => {
                const label = ability.label || ability.code || '';
                if (label) abilities.add(label);
            });
        }
    });
    [...abilities].sort().forEach(ability => {
        const option = document.createElement('option');
        option.value = ability;
        option.textContent = ability;
        abilityFilter.appendChild(option);
    });
}

// Display character list for selection
function displayCharacterList() {
    const characterList = document.getElementById('character-list');
    const searchTerm = document.getElementById('deck-search').value.toLowerCase();
    const packFilter = document.getElementById('deck-pack-filter').value;
    const costMin = document.getElementById('deck-cost-min').value;
    const costMax = document.getElementById('deck-cost-max').value;
    const powerMin = document.getElementById('deck-power-min').value;
    const powerMax = document.getElementById('deck-power-max').value;
    const abilityFilter = document.getElementById('deck-ability-filter').value;

    // Filter characters (type 0 only)
    let characters = cards.filter(card => card.type === 0);

    // Free text search
    if (searchTerm) {
        characters = characters.filter(card => {
            const nameMatch = (card.name || '').toLowerCase().includes(searchTerm);
            const tagMatch = (card.tags || []).some(tag => tag.toLowerCase().includes(searchTerm));
            const textMatch = (card.text || '').toLowerCase().includes(searchTerm);
            return nameMatch || tagMatch || textMatch;
        });
    }

    // Pack filter
    if (packFilter) {
        const packIndex = parseInt(packFilter);
        characters = characters.filter(card =>
            (card.packs || []).includes(packIndex)
        );
    }

    // Cost range filter
    if (costMin !== '') {
        const min = parseInt(costMin);
        characters = characters.filter(card => card.cost != null && card.cost >= min);
    }
    if (costMax !== '') {
        const max = parseInt(costMax);
        characters = characters.filter(card => card.cost != null && card.cost <= max);
    }

    // Power range filter
    if (powerMin !== '') {
        const min = parseInt(powerMin);
        if (min >= 9) {
            // 8+ means power >= 8
            characters = characters.filter(card => card.power != null && card.power >= 8);
        } else {
            characters = characters.filter(card => card.power != null && card.power >= min);
        }
    }
    if (powerMax !== '') {
        const max = parseInt(powerMax);
        if (max >= 9) {
            // 8+ means power >= 8 (no upper limit)
            characters = characters.filter(card => card.power != null && card.power >= 8);
        } else {
            characters = characters.filter(card => card.power != null && card.power <= max);
        }
    }

    // Ability filter
    if (abilityFilter) {
        characters = characters.filter(card => {
            if (!card.abilities || card.abilities.length === 0) return false;
            return card.abilities.some(ability => {
                const label = ability.label || ability.code || '';
                return label === abilityFilter;
            });
        });
    }

    characterList.innerHTML = '';

    if (characters.length === 0) {
        characterList.innerHTML = '<p class="no-results">該当するカードがありません</p>';
        return;
    }

    characters.forEach(card => {
        const cardItem = document.createElement('div');
        cardItem.className = 'character-item';

        const cost = card.cost !== null && card.cost !== undefined ? card.cost : '-';
        const power = card.power !== null && card.power !== undefined ? card.power : '-';
        const text = card.text || '';

        cardItem.innerHTML = `
            <div class="char-info">
                <span class="char-name">${escapeHtml(card.name)}</span>
            </div>
            <div class="char-stats">
                <span>コスト: ${cost}</span>
                <span>パワー: ${power}</span>
            </div>
            ${text ? `<div class="char-text">${escapeHtml(text)}</div>` : ''}
        `;

        cardItem.addEventListener('click', () => addCardToDeck(card));
        characterList.appendChild(cardItem);
    });
}

// Filter characters based on search and pack
function filterCharacters() {
    displayCharacterList();
}

// Add card to deck
function addCardToDeck(card) {
    // Validate deck rules
    if (currentDeck.length >= DECK_RULES.maxCards) {
        return;
    }

    if (!DECK_RULES.allowedTypes.includes(card.type)) {
        return;
    }

    // Add card to deck
    currentDeck.push(card);
    saveDeckToStorage();
    updateDeckDisplay();
}

// Remove card from deck
function removeCardFromDeck(index) {
    currentDeck.splice(index, 1);
    saveDeckToStorage();
    updateDeckDisplay();
}

// Update deck display
function updateDeckDisplay() {
    updateDeckList();
    updateDeckStats();
    updateDeckGrid();
    updateSaveButton();
}

// Update deck list panel
function updateDeckList() {
    const deckList = document.getElementById('deck-list');
    const deckCount = document.getElementById('deck-count');

    deckCount.textContent = `${currentDeck.length}/${DECK_RULES.maxCards}`;
    deckCount.className = 'deck-count ' + (currentDeck.length === DECK_RULES.maxCards ? 'full' : '');

    if (currentDeck.length === 0) {
        deckList.innerHTML = '<p class="no-cards">カードを追加してください</p>';
        return;
    }

    deckList.innerHTML = '';
    currentDeck.forEach((card, index) => {
        const deckItem = document.createElement('div');
        deckItem.className = 'deck-item';

        const cost = card.cost !== null && card.cost !== undefined ? card.cost : '-';

        deckItem.innerHTML = `
            <span class="deck-item-name">${escapeHtml(card.name)}</span>
            <button class="deck-item-remove btn-secondary" data-index="${index}">削除</button>
        `;

        deckItem.querySelector('.deck-item-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeCardFromDeck(index);
        });

        deckList.appendChild(deckItem);
    });
}

// Update deck statistics
function updateDeckStats() {
    const totalCostElement = document.getElementById('total-cost');

    if (currentDeck.length === 0) {
        totalCostElement.textContent = '0';
        return;
    }

    const totalCost = currentDeck.reduce((sum, card) => {
        const cost = card.cost !== null && card.cost !== undefined ? card.cost : 0;
        return sum + cost;
    }, 0);

    totalCostElement.textContent = totalCost;
}

// Update 3x3 grid preview
function updateDeckGrid() {
    const gridSlots = document.querySelectorAll('.grid-slot');

    gridSlots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.className = 'grid-slot';

        if (index < currentDeck.length) {
            const card = currentDeck[index];
            slot.classList.add('filled');

            if (card.image) {
                const img = document.createElement('img');
                img.src = `data/images/${card.image}`;
                img.alt = card.name;
                img.onerror = () => {
                    img.style.display = 'none';
                    slot.innerHTML = `<div class="card-placeholder">${escapeHtml(card.name)}</div>`;
                };
                slot.appendChild(img);
            } else {
                slot.innerHTML = `<div class="card-placeholder">${escapeHtml(card.name)}</div>`;
            }
        } else {
            slot.classList.add('empty');
            slot.innerHTML = `<div class="slot-number">${index + 1}</div>`;
        }
    });
}

// Update save button state
function updateSaveButton() {
    const saveBtn = document.getElementById('save-image-btn');
    saveBtn.disabled = currentDeck.length === 0;
}

// Clear deck
function clearDeck() {
    if (currentDeck.length === 0) return;

    if (confirm('デッキをクリアしてもよろしいですか?')) {
        currentDeck = [];
        saveDeckToStorage();
        updateDeckDisplay();
    }
}

// Export deck as JSON
// Export deck as text code
// Export deck as text code
function exportDeck() {
    if (currentDeck.length === 0) {
        showImportError('デッキが空です。');
        return;
    }

    // Create deck code from card IDs (e.g., "1,5,9,12,15,20,25,30,35")
    const deckCode = currentDeck.map(card => card.id).join(',');

    // Show export modal with deck code
    showExportModal(deckCode);
}

// Import deck from text code
function importDeck() {
    // Show import modal
    showImportModal();
}

// Show export modal
function showExportModal(deckCode) {
    const modal = document.getElementById('deck-code-export-modal');
    const textarea = document.getElementById('deck-code-export-textarea');
    const errorMsg = document.getElementById('export-error-message');

    // Clear error message
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';

    textarea.value = deckCode;
    modal.style.display = 'flex';

    // Select all text for easy copying
    setTimeout(() => {
        textarea.select();
        textarea.focus();
    }, 100);
}

// Close export modal
function closeExportModal() {
    const modal = document.getElementById('deck-code-export-modal');
    modal.style.display = 'none';
}

// Copy export deck code to clipboard
function copyExportDeckCode() {
    const textarea = document.getElementById('deck-code-export-textarea');
    const deckCode = textarea.value;
    const errorMsg = document.getElementById('export-error-message');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(deckCode).then(() => {
            const btn = document.getElementById('copy-export-code-btn');
            const originalText = btn.textContent;
            btn.textContent = 'コピーしました！';
            btn.style.backgroundColor = '#27ae60';

            // Clear any error message
            errorMsg.style.display = 'none';
            errorMsg.textContent = '';

            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
            }, 2000);
        }).catch(() => {
            showExportError('コピーに失敗しました。手動でコピーしてください。');
        });
    } else {
        // Fallback for older browsers
        textarea.select();
        try {
            document.execCommand('copy');
            const btn = document.getElementById('copy-export-code-btn');
            const originalText = btn.textContent;
            btn.textContent = 'コピーしました！';
            btn.style.backgroundColor = '#27ae60';

            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
            }, 2000);
        } catch (err) {
            showExportError('コピーに失敗しました。手動でコピーしてください。');
        }
    }
}

// Show export error message
function showExportError(message) {
    const errorMsg = document.getElementById('export-error-message');
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

// Show import modal
function showImportModal() {
    const modal = document.getElementById('deck-code-import-modal');
    const textarea = document.getElementById('deck-code-import-textarea');
    const errorMsg = document.getElementById('import-error-message');
    const successMsg = document.getElementById('import-success-message');

    // Clear messages
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
    successMsg.style.display = 'none';
    successMsg.textContent = '';

    textarea.value = '';
    modal.style.display = 'flex';

    // Focus on textarea
    setTimeout(() => {
        textarea.focus();
    }, 100);
}

// Close import modal
function closeImportModal() {
    const modal = document.getElementById('deck-code-import-modal');
    modal.style.display = 'none';
}

// Show import error message
function showImportError(message) {
    const errorMsg = document.getElementById('import-error-message');
    const successMsg = document.getElementById('import-success-message');

    successMsg.style.display = 'none';
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

// Show import success message
function showImportSuccess(message) {
    const errorMsg = document.getElementById('import-error-message');
    const successMsg = document.getElementById('import-success-message');

    errorMsg.style.display = 'none';
    successMsg.textContent = message;
    successMsg.style.display = 'block';

    // Auto close after success
    setTimeout(() => {
        closeImportModal();
    }, 1500);
}

// Process import deck code
function processImportDeckCode() {
    const textarea = document.getElementById('deck-code-import-textarea');
    const deckCode = textarea.value.trim();

    if (!deckCode) {
        showImportError('デッキコードを入力してください。');
        return;
    }

    try {
        // Parse deck code
        const cardIds = deckCode.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

        if (cardIds.length === 0) {
            throw new Error('有効なカードIDが見つかりませんでした。');
        }

        // Reconstruct deck from card IDs
        const newDeck = [];
        for (const cardId of cardIds) {
            const card = cards.find(c => c.id === cardId);
            if (card && card.type === 0) {
                newDeck.push(card);
            }
        }

        if (newDeck.length === 0) {
            showImportError('有効なカードが見つかりませんでした。');
            return;
        }

        currentDeck = newDeck.slice(0, DECK_RULES.maxCards);
        saveDeckToStorage();
        updateDeckDisplay();
        showImportSuccess(`${currentDeck.length}枚のカードを読み込みました。`);
    } catch (error) {
        showImportError('デッキの読み込みに失敗しました: ' + error.message);
    }
}

// Save deck as image
async function saveDeckAsImage() {
    if (currentDeck.length === 0) {
        alert('デッキが空です。');
        return;
    }

    const canvas = document.getElementById('deck-canvas');
    const ctx = canvas.getContext('2d');

    // Card dimensions (adjust based on actual image size)
    const cardWidth = 300;
    const cardHeight = 420;
    const cols = 3;
    const rows = 3;

    canvas.width = cardWidth * cols;
    canvas.height = cardHeight * rows;

    // Fill background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load and draw images
    const imagePromises = currentDeck.map((card, index) => {
        return new Promise((resolve) => {
            if (!card.image) {
                // Draw placeholder
                const col = index % cols;
                const row = Math.floor(index / cols);
                const x = col * cardWidth;
                const y = row * cardHeight;

                ctx.fillStyle = '#ddd';
                ctx.fillRect(x, y, cardWidth, cardHeight);
                ctx.strokeStyle = '#999';
                ctx.strokeRect(x, y, cardWidth, cardHeight);

                ctx.fillStyle = '#333';
                ctx.font = '20px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(card.name, x + cardWidth / 2, y + cardHeight / 2);

                resolve();
                return;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                const x = col * cardWidth;
                const y = row * cardHeight;

                ctx.drawImage(img, x, y, cardWidth, cardHeight);
                resolve();
            };
            img.onerror = () => {
                // Draw placeholder on error
                const col = index % cols;
                const row = Math.floor(index / cols);
                const x = col * cardWidth;
                const y = row * cardHeight;

                ctx.fillStyle = '#ddd';
                ctx.fillRect(x, y, cardWidth, cardHeight);
                ctx.strokeStyle = '#999';
                ctx.strokeRect(x, y, cardWidth, cardHeight);

                ctx.fillStyle = '#333';
                ctx.font = '20px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(card.name, x + cardWidth / 2, y + cardHeight / 2);

                resolve();
            };
            img.src = `data/images/${card.image}`;
        });
    });

    await Promise.all(imagePromises);

    // Download image as PNG
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `deck_${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
}

// Save deck to localStorage
function saveDeckToStorage() {
    try {
        const deckIds = currentDeck.map(card => card.id);
        localStorage.setItem('kamiha_deck', JSON.stringify(deckIds));
    } catch (error) {
        console.error('Failed to save deck:', error);
    }
}

// Load deck from localStorage
function loadDeckFromStorage() {
    try {
        const stored = localStorage.getItem('kamiha_deck');
        if (!stored) return;

        const deckIds = JSON.parse(stored);
        if (!Array.isArray(deckIds)) return;

        // Wait for cards to be loaded
        const checkLoaded = setInterval(() => {
            if (cards.length > 0) {
                clearInterval(checkLoaded);
                currentDeck = deckIds
                    .map(id => cards.find(c => c.id === id))
                    .filter(card => card && card.type === 0)
                    .slice(0, DECK_RULES.maxCards);

                updateDeckDisplay();
            }
        }, 100);
    } catch (error) {
        console.error('Failed to load deck:', error);
    }
}
