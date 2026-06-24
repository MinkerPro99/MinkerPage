// Vocabulary App - Complete JavaScript Implementation

        let app = null;

        class VocabularyApp {
            constructor() {
                this.vocabSets = this.loadFromLocalStorage() || [];
                this.currentSet = null;
                this.currentIndex = 0;
                this.currentMode = null;
                this.studyResults = { correct: 0, incorrect: 0, skipped: 0 };
                this.blocksQueue = [];
                this.blocksCurrentTerm = null;
                this.blocksBoard = [];
                this.blocksHand = [];
                this.blocksPlacedCount = 0;
                this.blocksRoundScore = 0;
                this.blocksTotalScore = 0;
                this.blocksSolvedCount = 0;
                this.blocksTriesLeft = 3;
                this.blocksQuestionAttempts = 0;
                this.blocksTotalTerms = 0;
                this.blocksPendingAdvance = null;
                this.blocksPendingClear = null;
                this.blocksStatusMessage = '';
                this.blocksGameOver = false;
                this.blocksDraggedPieceId = null;
                this.blocksSelectedPieceId = null;
                this.blocksPointerDragId = null;
                this.blocksPointerActive = false;
                this.blocksPointerId = null;
                this.blocksDragAnchor = { x: 0, y: 0 };
                this.blocksClearingLines = [];
                this.blocksBoardSize = 8;
                this.blocksColorClasses = ['filled-0', 'filled-1', 'filled-2'];
                this.blocksShapeLibrary = [
                    { name: 'Line3', cells: [[0, 0], [1, 0], [2, 0]] },
                    { name: 'Line4', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
                    { name: 'Line5', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
                    { name: 'Square', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
                    { name: 'L4', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
                    { name: 'J4', cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },
                    { name: 'T4', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
                    { name: 'Z4', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
                    { name: 'S4', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
                    { name: 'Hook5', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
                    { name: 'Step5', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] }
                ];
                this.learningConfig = {
                    inputMode: 'typing',
                    directions: {
                        termToDefinition: true,
                        definitionToTerm: true
                    }
                };
                this.learningQueue = [];
                this.learningMastered = 0;
                this.learningTotal = 0;
                this.learningAttemptCount = 0;
                this.learningPendingFeedback = null;
                this.init();
            }

            init() {
                this.renderSetsList();
            }

            // CUSTOM ALERT SYSTEM
            showAlert(title, message, buttons = []) {
                return new Promise((resolve) => {
                    const overlay = document.getElementById('alertOverlay');
                    const modal = document.getElementById('alertModal');
                    const titleEl = document.getElementById('alertTitle');
                    const messageEl = document.getElementById('alertMessage');
                    const inputEl = document.getElementById('alertInput');
                    const buttonsContainer = document.getElementById('alertButtons');

                    titleEl.textContent = title;
                    messageEl.textContent = message;
                    inputEl.style.display = 'none';
                    inputEl.value = '';
                    buttonsContainer.innerHTML = '';

                    if (buttons.length === 0) {
                        buttons = ['OK'];
                    }

                    buttons.forEach((label, index) => {
                        const btn = document.createElement('button');
                        btn.className = `custom-alert-btn ${index === 0 ? 'custom-alert-btn-primary' : 'custom-alert-btn-secondary'}`;
                        btn.textContent = label;
                        btn.onclick = () => {
                            this.closeAlert();
                            resolve(index);
                        };
                        buttonsContainer.appendChild(btn);
                    });

                    overlay.classList.add('show');
                    modal.style.display = 'block';
                });
            }

            showPrompt(title, message, placeholder = '', defaultValue = '') {
                return new Promise((resolve) => {
                    const overlay = document.getElementById('alertOverlay');
                    const modal = document.getElementById('alertModal');
                    const titleEl = document.getElementById('alertTitle');
                    const messageEl = document.getElementById('alertMessage');
                    const inputEl = document.getElementById('alertInput');
                    const buttonsContainer = document.getElementById('alertButtons');

                    titleEl.textContent = title;
                    messageEl.textContent = message;
                    inputEl.style.display = 'block';
                    inputEl.placeholder = placeholder;
                    inputEl.value = defaultValue;
                    buttonsContainer.innerHTML = '';

                    const createBtn = (label, primary, onClick) => {
                        const btn = document.createElement('button');
                        btn.className = `custom-alert-btn ${primary ? 'custom-alert-btn-primary' : 'custom-alert-btn-secondary'}`;
                        btn.textContent = label;
                        btn.onclick = onClick;
                        return btn;
                    };

                    const cancelBtn = createBtn('Cancel', false, () => {
                        this.closeAlert();
                        resolve(null);
                    });

                    const createBtnConfirm = createBtn('Create', true, () => {
                        const value = inputEl.value.trim();
                        this.closeAlert();
                        resolve(value.length > 0 ? value : null);
                    });

                    buttonsContainer.appendChild(cancelBtn);
                    buttonsContainer.appendChild(createBtnConfirm);

                    inputEl.onkeydown = (event) => {
                        if (event.key === 'Enter') {
                            createBtnConfirm.click();
                        }
                    };

                    overlay.classList.add('show');
                    modal.style.display = 'block';
                    setTimeout(() => inputEl.focus(), 0);
                });
            }

            showConfirm(title, message) {
                return this.showAlert(title, message, ['Yes', 'No']).then(result => result === 0);
            }

            closeAlert() {
                const overlay = document.getElementById('alertOverlay');
                const modal = document.getElementById('alertModal');
                overlay.classList.remove('show');
                modal.style.display = 'none';
            }

            // STORAGE
            loadFromLocalStorage() {
                const data = localStorage.getItem('vocabSets');
                return data ? JSON.parse(data) : null;
            }

            saveToLocalStorage() {
                localStorage.setItem('vocabSets', JSON.stringify(this.vocabSets));
            }

            // VIEW MANAGEMENT
            switchView(view) {
                document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
                if (view === 'setsList') {
                    document.getElementById('setsListView').style.display = 'block';
                    this.renderSetsList();
                } else if (view === 'editor') {
                    document.getElementById('setEditorView').style.display = 'block';
                    this.renderSetEditor();
                } else if (view === 'study') {
                    document.getElementById('studyModeView').style.display = 'block';
                }
            }

            // SETS MANAGEMENT
            showCreateSetForm() {
                this.showPrompt('Create Set', 'Enter a title for your new set:', 'Set title').then(setName => {
                    if (!setName) {
                        return;
                    }
                    this.currentSet = {
                        id: Date.now(),
                        name: setName,
                        description: '',
                        terms: [],
                        stats: { studied: 0, accuracy: 0 }
                    };
                    this.switchView('editor');
                });
            }

            saveCurrentSet() {
                const title = document.getElementById('setTitle').value.trim();
                if (!title) {
                    this.showAlert('Error', 'Set title cannot be empty!');
                    return;
                }

                this.currentSet.name = title;
                this.currentSet.description = document.getElementById('setDescription').value;

                const termInputs = document.querySelectorAll('.term-pair');
                this.currentSet.terms = [];

                termInputs.forEach(group => {
                    const termInput = group.querySelector('[data-type="term"]');
                    const defInput = group.querySelector('[data-type="definition"]');
                    if (termInput.value.trim() && defInput.value.trim()) {
                        this.currentSet.terms.push({
                            id: Date.now() + Math.random(),
                            term: termInput.value.trim(),
                            definition: defInput.value.trim()
                        });
                    }
                });

                if (this.currentSet.terms.length === 0) {
                    this.showAlert('Error', 'Please add at least one term!');
                    return;
                }

                const existingIndex = this.vocabSets.findIndex(set => set.id === this.currentSet.id);
                if (existingIndex >= 0) {
                    this.vocabSets[existingIndex] = this.currentSet;
                } else {
                    this.vocabSets.push(this.currentSet);
                }

                this.saveToLocalStorage();
                this.showAlert('Success', 'Set saved successfully!', ['OK']).then(() => {
                    this.switchView('setsList');
                });
            }

            deleteSet(setId) {
                this.showConfirm('Delete Set', 'Are you sure you want to delete this set?').then(confirmed => {
                    if (confirmed) {
                        this.vocabSets = this.vocabSets.filter(set => set.id !== setId);
                        this.saveToLocalStorage();
                        this.renderSetsList();
                    }
                });
            }

            renderSetsList() {
                const setsList = document.getElementById('setsList');
                const emptyMessage = document.getElementById('emptyMessage');

                setsList.innerHTML = '';

                if (this.vocabSets.length === 0) {
                    emptyMessage.style.display = 'block';
                    setsList.style.display = 'none';
                    return;
                }

                emptyMessage.style.display = 'none';
                setsList.style.display = 'grid';

                this.vocabSets.forEach(set => {
                    const card = document.createElement('div');
                    card.className = 'col-md-6 col-lg-4';
                    card.innerHTML = `
                        <div class="set-card" onclick="app.openSet(${set.id})">
                            <div class="set-card-title">${this.escapeHtml(set.name)}</div>
                            <div class="set-card-description">${this.escapeHtml(set.description || 'No description')}</div>
                            <div class="set-card-stats">
                                <span>${set.terms.length} terms</span>
                                <span>${set.stats.accuracy}% accuracy</span>
                            </div>
                            <div class="set-card-actions">
                                <button class="btn vocab-btn btn-sm" onclick="event.stopPropagation(); app.editSet(${set.id})">Edit</button>
                                <button class="btn vocab-btn btn-sm btn-danger" onclick="event.stopPropagation(); app.deleteSet(${set.id})">Delete</button>
                            </div>
                        </div>
                    `;
                    setsList.appendChild(card);
                });
            }

            openSet(setId) {
                this.currentSet = this.vocabSets.find(set => set.id === setId);
                if (this.currentSet) {
                    const nextView = this.currentSet.terms.length === 0 ? 'editor' : 'study';
                    this.switchView(nextView);
                    if (nextView === 'study') {
                        document.getElementById('studySetTitle').textContent = this.currentSet.name;
                        this.renderStudyModeSelection();
                    }
                }
            }

            editSet(setId) {
                this.currentSet = this.vocabSets.find(set => set.id === setId);
                if (!this.currentSet) {
                    return;
                }
                this.switchView('editor');
            }

            renderSetEditor() {
                document.getElementById('setTitle').value = this.currentSet.name;
                document.getElementById('setDescription').value = this.currentSet.description || '';
                this.renderTermsEditor();
            }

            renderTermsEditor() {
                const container = document.getElementById('termsContainer');
                container.innerHTML = '';

                this.currentSet.terms.forEach((term, index) => {
                    const group = document.createElement('div');
                    group.className = 'term-input-group term-pair';
                    group.innerHTML = `
                        <div>
                            <label class="term-label">Term ${index + 1}</label>
                            <input type="text" class="term-input form-control" data-type="term" value="${this.escapeHtml(term.term)}" placeholder="Enter term">
                        </div>
                        <div>
                            <label class="term-label">Definition</label>
                            <input type="text" class="term-input form-control" data-type="definition" value="${this.escapeHtml(term.definition)}" placeholder="Enter definition">
                        </div>
                        <button class="btn vocab-btn btn-danger btn-sm" onclick="app.removeTerm(${index})" style="height: fit-content;">Remove</button>
                    `;
                    container.appendChild(group);
                });
            }

            addNewTerm() {
                // Save current form data to preserve existing terms
                const termInputs = document.querySelectorAll('.term-pair');
                const savedTerms = [];
                termInputs.forEach(group => {
                    const termInput = group.querySelector('[data-type="term"]');
                    const defInput = group.querySelector('[data-type="definition"]');
                    if (termInput && defInput) {
                        savedTerms.push({
                            term: termInput.value,
                            definition: defInput.value
                        });
                    }
                });

                // Update current set with saved data
                this.currentSet.terms = savedTerms.map((t, idx) => ({
                    id: this.currentSet.terms[idx]?.id || Date.now() + Math.random(),
                    term: t.term,
                    definition: t.definition
                }));

                // Add new empty term
                this.currentSet.terms.push({ id: Date.now() + Math.random(), term: '', definition: '' });
                this.renderTermsEditor();
                setTimeout(() => {
                    const allTermInputs = document.querySelectorAll('[data-type="term"]');
                    if (allTermInputs.length > 0) {
                        allTermInputs[allTermInputs.length - 1].focus();
                    }
                }, 0);
            }

            removeTerm(index) {
                this.currentSet.terms.splice(index, 1);
                this.renderTermsEditor();
            }

            // STUDY MODE
            renderStudyModeSelection() {
                document.getElementById('modeSelectionView').style.display = 'block';
                document.getElementById('learningSetupView').style.display = 'none';
                document.getElementById('blocksSetupView').style.display = 'none';
                document.getElementById('studyContentView').style.display = 'none';
                document.getElementById('resultsView').style.display = 'none';
            }

            startStudySession(mode) {
                const minimumTerms = mode === 'blocks' ? 1 : 2;
                if (this.currentSet.terms.length < minimumTerms) {
                    this.showAlert('Error', mode === 'blocks' ? 'You need at least 1 term for Blocks mode!' : 'You need at least 2 terms to study!');
                    return;
                }

                if (mode === 'learning') {
                    this.renderLearningSetup();
                    return;
                }

                if (mode === 'blocks') {
                    this.renderBlocksSetup();
                    return;
                }

                this.currentMode = mode;
                this.currentIndex = 0;
                this.isFlipping = false;
                this.studyResults = { correct: 0, incorrect: 0, skipped: 0 };

                document.getElementById('modeSelectionView').style.display = 'none';
                document.getElementById('studyContentView').style.display = 'block';
                document.getElementById('resultsView').style.display = 'none';

                this.renderStudyContent();
            }

            renderLearningSetup() {
                document.getElementById('modeSelectionView').style.display = 'none';
                document.getElementById('learningSetupView').style.display = 'block';
                document.getElementById('blocksSetupView').style.display = 'none';
                document.getElementById('studyContentView').style.display = 'none';
                document.getElementById('resultsView').style.display = 'none';
                this.updateLearningOptionUI();
            }

            renderBlocksSetup() {
                document.getElementById('modeSelectionView').style.display = 'none';
                document.getElementById('learningSetupView').style.display = 'none';
                document.getElementById('blocksSetupView').style.display = 'block';
                document.getElementById('studyContentView').style.display = 'none';
                document.getElementById('resultsView').style.display = 'none';
            }

            setLearningInputMode(mode) {
                this.learningConfig.inputMode = mode;
                this.updateLearningOptionUI();
            }

            toggleLearningDirection(direction) {
                this.learningConfig.directions[direction] = !this.learningConfig.directions[direction];

                if (!this.learningConfig.directions.termToDefinition && !this.learningConfig.directions.definitionToTerm) {
                    this.learningConfig.directions[direction] = true;
                }

                this.updateLearningOptionUI();
            }

            updateLearningOptionUI() {
                document.querySelectorAll('[data-learning-input]').forEach(button => {
                    button.classList.toggle('active', button.dataset.learningInput === this.learningConfig.inputMode);
                });

                document.querySelectorAll('[data-learning-direction]').forEach(button => {
                    button.classList.toggle('active', !!this.learningConfig.directions[button.dataset.learningDirection]);
                });
            }

            beginLearningSession() {
                const enabledDirections = [];

                if (this.learningConfig.directions.termToDefinition) {
                    enabledDirections.push({
                        promptField: 'term',
                        answerField: 'definition',
                        label: 'Term to definition'
                    });
                }

                if (this.learningConfig.directions.definitionToTerm) {
                    enabledDirections.push({
                        promptField: 'definition',
                        answerField: 'term',
                        label: 'Definition to term'
                    });
                }

                if (enabledDirections.length === 0) {
                    this.showAlert('Error', 'Please enable at least one study direction.');
                    return;
                }

                this.currentMode = 'learning';
                this.currentIndex = 0;
                this.learningQueue = [];
                this.learningMastered = 0;
                this.learningAttemptCount = 0;
                this.learningTotal = this.currentSet.terms.length * enabledDirections.length;

                this.currentSet.terms.forEach(term => {
                    enabledDirections.forEach(direction => {
                        this.learningQueue.push({
                            termId: term.id,
                            promptField: direction.promptField,
                            answerField: direction.answerField,
                            label: direction.label,
                            promptText: term[direction.promptField],
                            answerText: term[direction.answerField]
                        });
                    });
                });

                document.getElementById('learningSetupView').style.display = 'none';
                document.getElementById('modeSelectionView').style.display = 'none';
                document.getElementById('studyContentView').style.display = 'block';
                document.getElementById('resultsView').style.display = 'none';

                this.renderLearningCard();
            }

            beginBlocksSession() {
                this.currentMode = 'blocks';
                this.blocksQueue = this.shuffleList([...this.currentSet.terms]);
                this.blocksTotalTerms = this.blocksQueue.length;
                this.blocksSolvedCount = 0;
                this.blocksTotalScore = 0;
                this.blocksPendingAdvance = null;
                this.blocksGameOver = false;
                this.blocksBoard = this.createBlocksBoard();

                document.getElementById('blocksSetupView').style.display = 'none';
                document.getElementById('modeSelectionView').style.display = 'none';
                document.getElementById('studyContentView').style.display = 'block';
                document.getElementById('resultsView').style.display = 'none';

                this.startBlocksRound();
            }

            startBlocksRound() {
                if (this.blocksPendingAdvance) {
                    clearTimeout(this.blocksPendingAdvance);
                    this.blocksPendingAdvance = null;
                }

                if (this.blocksPendingClear) {
                    clearTimeout(this.blocksPendingClear);
                    this.blocksPendingClear = null;
                }

                this.blocksClearingLines = [];

                if (this.blocksQueue.length === 0) {
                    this.blocksQueue = this.shuffleList([...this.currentSet.terms]);
                    this.blocksTotalTerms += this.blocksQueue.length;
                    this.blocksStatusMessage = 'All terms solved. Shuffling a fresh round.';
                }

                this.blocksCurrentTerm = this.blocksQueue[0];
                const hand = this.generateBlocksHand();
                if (!hand) {
                    this.endBlocksGame('No blocks fit anymore.');
                    return;
                }

                this.blocksHand = hand;
                this.blocksPlacedCount = 0;
                this.blocksRoundScore = 0;
                this.blocksTriesLeft = 3;
                this.blocksQuestionAttempts = 0;
                this.blocksStatusMessage = '';
                this.blocksDraggedPieceId = null;
                this.blocksSelectedPieceId = null;
                this.blocksPointerDragId = null;
                this.blocksPointerActive = false;
                this.blocksPointerId = null;
                this.blocksDragAnchor = { x: 0, y: 0 };

                this.renderBlocksRound();
            }

            renderBlocksRound() {
                const studyContent = document.getElementById('studyContent');
                if (!studyContent) {
                    return;
                }

                this.updateProgressBar();
                const statusText = this.blocksStatusMessage || (this.blocksPlacedCount < 3
                    ? `Place block ${this.blocksPlacedCount + 1} of 3 for ${this.escapeHtml(this.blocksCurrentTerm.term)}.`
                    : `Answer the question about ${this.escapeHtml(this.blocksCurrentTerm.term)}.`);

                studyContent.innerHTML = `
                    <div class="blocks-shell">
                        <div class="blocks-scoreboard">
                            <div class="stat-box">
                                <div class="stat-value">${this.blocksTotalScore}</div>
                                <div class="stat-label">Score</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${this.blocksRoundScore}</div>
                                <div class="stat-label">Round</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${this.blocksSolvedCount}</div>
                                <div class="stat-label">Solved</div>
                            </div>
                        </div>
                        <div class="blocks-status">${statusText}</div>
                        <div class="blocks-board-wrap">
                            <div>
                                <div class="blocks-board" id="blocksBoard">
                                    ${this.renderBlocksBoard()}
                                </div>
                            </div>
                            <div class="blocks-hand-panel">
                                ${this.renderBlocksHand()}
                            </div>
                        </div>
                        <div class="learning-helper" style="margin-top: 14px;">Drag a block onto any empty cell. Completed rows or columns clear like Tetris. If the board fills up, the game ends.</div>
                    </div>
                `;

                if (this.blocksPlacedCount >= 3) {
                    this.showBlocksQuestionModal();
                } else {
                    this.closeBlocksQuestionModal();
                }
            }

            createBlocksBoard() {
                return Array.from({ length: this.blocksBoardSize }, () => Array(this.blocksBoardSize).fill(null));
            }

            shuffleList(list) {
                return list
                    .map(item => ({ item, sort: Math.random() }))
                    .sort((a, b) => a.sort - b.sort)
                    .map(entry => entry.item);
            }

            generateBlocksHand() {
                const maxAttempts = 80;

                for (let pass = 0; pass < 4; pass++) {
                    for (let attempt = 0; attempt < maxAttempts; attempt++) {
                        const candidate = this.pickBlocksHandCandidate();
                        if (this.isBlocksHandSolvable(candidate, this.blocksBoard)) {
                            this.blocksHand = candidate;
                            return candidate;
                        }
                    }

                    const target = this.findBlocksBestLineToClear();
                    if (!target) {
                        break;
                    }

                    this.clearBlocksLine(target.type, target.index);
                }

                return null;
            }

            pickBlocksHandCandidate() {
                const shuffledShapes = this.shuffleList(this.blocksShapeLibrary.map(shape => ({
                    name: shape.name,
                    cells: shape.cells.map(([x, y]) => [x, y])
                })));
                const pieces = [];

                for (let index = 0; index < 3; index++) {
                    const shape = shuffledShapes[index % shuffledShapes.length];
                    pieces.push(this.createBlocksPiece(shape, index));
                }

                return pieces;
            }

            isBlocksHandSolvable(pieces, board = this.blocksBoard) {
                return this.canSolveBlocksHand(board, pieces);
            }

            canSolveBlocksHand(board, pieces) {
                if (pieces.length === 0) {
                    return true;
                }

                for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
                    const piece = pieces[pieceIndex];
                    const remainingPieces = pieces.filter((_, index) => index !== pieceIndex);

                    for (let row = 0; row < this.blocksBoardSize; row++) {
                        for (let column = 0; column < this.blocksBoardSize; column++) {
                            if (!this.canPlaceBlocksPieceAtOrigin(row, column, piece, board)) {
                                continue;
                            }

                            const nextBoard = this.cloneBlocksBoard(board);
                            this.applyBlocksPieceToBoard(nextBoard, row, column, piece);
                            const completedLines = this.getBlocksCompletedLines(nextBoard);
                            this.clearBlocksLinesOnBoard(nextBoard, completedLines);

                            if (this.canSolveBlocksHand(nextBoard, remainingPieces)) {
                                return true;
                            }
                        }
                    }
                }

                return false;
            }

            createBlocksPiece(shape, colorIndex) {
                return {
                    id: `piece-${Date.now()}-${Math.random()}-${colorIndex}`,
                    name: shape.name,
                    cells: shape.cells.map(([x, y]) => [x, y]),
                    colorIndex: colorIndex % this.blocksColorClasses.length
                };
            }

            renderBlocksBoard() {
                let html = '';

                for (let row = 0; row < this.blocksBoardSize; row++) {
                    for (let column = 0; column < this.blocksBoardSize; column++) {
                        const value = this.blocksBoard[row][column];
                        let cellClass = value === null ? 'blocks-cell' : `blocks-cell filled-${value}`;

                        if (this.blocksClearingLines.some(line => line.type === 'row' && line.index === row)) {
                            cellClass += ' clearing';
                        }

                        if (this.blocksClearingLines.some(line => line.type === 'column' && line.index === column)) {
                            cellClass += ' clearing';
                        }

                        html += `<button type="button" class="${cellClass}" data-block-row="${row}" data-block-column="${column}" ondragover="app.previewBlocksDrop(event, ${row}, ${column})" ondragenter="app.previewBlocksDrop(event, ${row}, ${column})" ondragleave="app.clearBlocksDropPreview(event)" ondrop="app.dropBlocksPiece(event, ${row}, ${column})" onclick="app.tapBlocksBoardCell(${row}, ${column})" aria-label="Board cell ${row + 1}, ${column + 1}"></button>`;
                    }
                }

                return html;
            }

            renderBlocksHand() {
                return `
                    <div class="blocks-hand">
                        ${this.blocksHand.map(piece => `
                            <div class="blocks-piece ${this.blocksDraggedPieceId === piece.id ? 'dragging' : ''} ${this.blocksSelectedPieceId === piece.id ? 'selected' : ''}" draggable="true" data-block-piece="${piece.id}" aria-label="${this.escapeHtml(piece.name)}" onmousedown="app.setBlocksGrabAnchor(event, '${piece.id}', null, null)" onclick="app.selectBlocksPiece('${piece.id}')" onpointerdown="app.startBlocksPointerDrag(event, '${piece.id}')" onpointermove="app.moveBlocksPointerDrag(event)" onpointerup="app.endBlocksPointerDrag(event)" onpointercancel="app.cancelBlocksPointerDrag(event)" ondragstart="app.startBlocksDrag(event, '${piece.id}')" ondragend="app.endBlocksDrag(event)">
                                <div class="blocks-piece-grid">
                                    ${this.renderBlocksPiecePreview(piece)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            getBlocksPieceBounds(cells) {
                const xs = cells.map(([x]) => x);
                const ys = cells.map(([, y]) => y);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);

                return {
                    minX,
                    minY,
                    width: maxX - minX + 1,
                    height: maxY - minY + 1
                };
            }

            renderBlocksPiecePreview(piece) {
                const bounds = this.getBlocksPieceBounds(piece.cells);
                const cellSet = new Set(piece.cells.map(([x, y]) => `${x},${y}`));
                let html = '';

                html += `<div class="blocks-piece-grid" style="grid-template-columns: repeat(${bounds.width}, 22px); grid-template-rows: repeat(${bounds.height}, 22px);">`;

                for (let row = 0; row < bounds.height; row++) {
                    for (let column = 0; column < bounds.width; column++) {
                        const shapeX = bounds.minX + column;
                        const shapeY = bounds.minY + row;
                        if (cellSet.has(`${shapeX},${shapeY}`)) {
                            html += `<div class="blocks-piece-cell filled-${piece.colorIndex}" data-piece-x="${shapeX}" data-piece-y="${shapeY}" onmousedown="app.setBlocksGrabAnchor(event, '${piece.id}', ${shapeX}, ${shapeY})"></div>`;
                        } else {
                            html += `<div class="blocks-piece-cell empty"></div>`;
                        }
                    }
                }

                html += '</div>';

                return html;
            }

            startBlocksDrag(event, pieceId) {
                this.blocksDraggedPieceId = pieceId;
                this.blocksSelectedPieceId = pieceId;
                if (event?.dataTransfer) {
                    event.dataTransfer.setData('text/plain', pieceId);
                    event.dataTransfer.effectAllowed = 'move';
                }
            }

            startBlocksPointerDrag(event, pieceId) {
                if (!event || event.pointerType === 'mouse') {
                    return;
                }

                event.preventDefault();
                this.setBlocksGrabAnchor(event, pieceId, null, null);
                this.blocksPointerDragId = pieceId;
                this.blocksPointerActive = true;
                this.blocksPointerId = event.pointerId;

                if (event.currentTarget?.setPointerCapture) {
                    try {
                        event.currentTarget.setPointerCapture(event.pointerId);
                    } catch (error) {
                        // Ignore capture failures on browsers that do not support it reliably.
                    }
                }

                this.updateBlocksPointerPreview(event.clientX, event.clientY);
            }

            moveBlocksPointerDrag(event) {
                if (!this.blocksPointerActive || this.blocksPointerId !== event.pointerId) {
                    return;
                }

                event.preventDefault();
                this.updateBlocksPointerPreview(event.clientX, event.clientY);
            }

            endBlocksPointerDrag(event) {
                if (!this.blocksPointerActive || this.blocksPointerId !== event.pointerId) {
                    return;
                }

                event.preventDefault();
                const placed = this.dropBlocksFromPointerPoint(event.clientX, event.clientY);
                if (!placed) {
                    this.clearBlocksPlacementPreview();
                    this.renderBlocksRound();
                }

                this.blocksPointerActive = false;
                this.blocksPointerId = null;
                this.blocksPointerDragId = null;

                if (event.currentTarget?.releasePointerCapture) {
                    try {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    } catch (error) {
                        // Ignore release failures on browsers that do not support it reliably.
                    }
                }
            }

            cancelBlocksPointerDrag(event) {
                if (!this.blocksPointerActive || this.blocksPointerId !== event.pointerId) {
                    return;
                }

                this.blocksPointerActive = false;
                this.blocksPointerId = null;
                this.blocksPointerDragId = null;
                this.clearBlocksPlacementPreview();
                this.renderBlocksRound();
            }

            updateBlocksPointerPreview(clientX, clientY) {
                const target = document.elementFromPoint(clientX, clientY);
                const boardCell = target?.closest?.('.blocks-cell');
                if (!boardCell) {
                    this.clearBlocksPlacementPreview();
                    return;
                }

                const row = Number(boardCell.dataset.blockRow);
                const column = Number(boardCell.dataset.blockColumn);
                if (!Number.isFinite(row) || !Number.isFinite(column)) {
                    this.clearBlocksPlacementPreview();
                    return;
                }

                this.previewBlocksDrop({ preventDefault() {} }, row, column);
            }

            dropBlocksFromPointerPoint(clientX, clientY) {
                const target = document.elementFromPoint(clientX, clientY);
                const boardCell = target?.closest?.('.blocks-cell');
                const pieceId = this.blocksPointerDragId || this.blocksSelectedPieceId || this.blocksDraggedPieceId;
                if (!pieceId || !boardCell) {
                    return false;
                }

                const row = Number(boardCell.dataset.blockRow);
                const column = Number(boardCell.dataset.blockColumn);
                if (!Number.isFinite(row) || !Number.isFinite(column)) {
                    return false;
                }

                this.placeBlocksPiece(pieceId, row, column);
                return true;
            }

            setBlocksGrabAnchor(event, pieceId, pieceX, pieceY) {
                if (event) {
                    event.stopPropagation();
                }

                this.blocksDraggedPieceId = pieceId;
                this.blocksSelectedPieceId = pieceId;
                const piece = this.findBlocksPiece(pieceId);
                if (!piece) {
                    this.blocksDragAnchor = { x: 0, y: 0 };
                    return;
                }

                if (Number.isFinite(pieceX) && Number.isFinite(pieceY)) {
                    this.blocksDragAnchor = { x: pieceX, y: pieceY };
                    return;
                }

                const bounds = this.getBlocksPieceBounds(piece.cells);
                this.blocksDragAnchor = {
                    x: bounds.minX,
                    y: bounds.minY
                };
            }

            endBlocksDrag() {
                this.blocksDraggedPieceId = null;
                this.clearBlocksPlacementPreview();
                this.renderBlocksRound();
            }

            selectBlocksPiece(pieceId) {
                const piece = this.findBlocksPiece(pieceId);
                if (!piece) {
                    return;
                }

                this.setBlocksGrabAnchor(null, pieceId, null, null);
                this.blocksSelectedPieceId = pieceId;
                this.blocksStatusMessage = `Selected ${piece.name}. Tap a board cell to place it.`;
                this.renderBlocksRound();
            }

            tapBlocksBoardCell(row, column) {
                const pieceId = this.blocksSelectedPieceId || this.blocksDraggedPieceId;
                if (!pieceId || this.blocksHand.length === 0) {
                    return;
                }

                this.placeBlocksPiece(pieceId, row, column);
            }

            previewBlocksDrop(event, row, column) {
                event.preventDefault();
                const piece = this.findBlocksPiece(this.blocksDraggedPieceId);
                if (!piece) {
                    return;
                }

                const anchor = this.blocksDragAnchor || { x: 0, y: 0 };
                const origin = this.getBlocksPlacementOrigin(row, column, anchor);
                const preview = this.getBlocksPlacementPreview(piece, origin.row, origin.column);
                if (!preview.cells.length) {
                    this.clearBlocksPlacementPreview();
                    return;
                }

                this.paintBlocksPlacementPreview(preview.cells, preview.valid);
            }

            clearBlocksDropPreview(event) {
                if (!event?.relatedTarget || !event.relatedTarget.closest('.blocks-board')) {
                    this.clearBlocksPlacementPreview();
                }
            }

            findBlocksPiece(pieceId) {
                return this.blocksHand.find(piece => piece.id === pieceId) || null;
            }

            hasBlocksAnyPlacement(piece) {
                for (let row = 0; row < this.blocksBoardSize; row++) {
                    for (let column = 0; column < this.blocksBoardSize; column++) {
                        if (this.canPlaceBlocksPieceAtOrigin(row, column, piece, this.blocksBoard)) {
                            return true;
                        }
                    }
                }

                return false;
            }

            getBlocksPlacementOrigin(row, column, anchor = { x: 0, y: 0 }) {
                return {
                    row: row - anchor.y,
                    column: column - anchor.x
                };
            }

            getBlocksPlacementCells(piece, originRow, originColumn, board = this.blocksBoard) {
                const cells = [];

                for (const [dx, dy] of piece.cells) {
                    const targetRow = originRow + dy;
                    const targetColumn = originColumn + dx;
                    if (targetRow < 0 || targetRow >= this.blocksBoardSize || targetColumn < 0 || targetColumn >= this.blocksBoardSize) {
                        continue;
                    }

                    if (board[targetRow][targetColumn] !== null) {
                        continue;
                    }

                    cells.push({ row: targetRow, column: targetColumn });
                }

                return cells.length === piece.cells.length ? cells : null;
            }

            getBlocksPlacementPreview(piece, originRow, originColumn, board = this.blocksBoard) {
                const cells = [];
                let valid = true;

                for (const [dx, dy] of piece.cells) {
                    const targetRow = originRow + dy;
                    const targetColumn = originColumn + dx;

                    if (targetRow < 0 || targetRow >= this.blocksBoardSize || targetColumn < 0 || targetColumn >= this.blocksBoardSize) {
                        valid = false;
                        continue;
                    }

                    if (board[targetRow][targetColumn] !== null) {
                        valid = false;
                    }

                    cells.push({ row: targetRow, column: targetColumn });
                }

                return { cells, valid };
            }

            canPlaceBlocksPieceAtOrigin(originRow, originColumn, piece, board = this.blocksBoard) {
                return this.getBlocksPlacementCells(piece, originRow, originColumn, board) !== null;
            }

            paintBlocksPlacementPreview(cells, isValid) {
                this.clearBlocksPlacementPreview();
                const className = isValid ? 'drop-hover' : 'drop-invalid';
                cells.forEach(cell => {
                    const cellElement = document.querySelector(`[data-block-row="${cell.row}"][data-block-column="${cell.column}"]`);
                    if (cellElement) {
                        cellElement.classList.add(className);
                    }
                });
            }

            clearBlocksPlacementPreview() {
                document.querySelectorAll('.blocks-cell.drop-hover, .blocks-cell.drop-invalid').forEach(cell => {
                    cell.classList.remove('drop-hover', 'drop-invalid');
                });
            }

            dropBlocksPiece(event, row, column) {
                event.preventDefault();

                const pieceId = event.dataTransfer?.getData('text/plain') || this.blocksDraggedPieceId;
                this.placeBlocksPiece(pieceId, row, column);
            }

            placeBlocksPiece(pieceId, row, column) {
                const piece = this.findBlocksPiece(pieceId);
                if (!piece) {
                    return;
                }

                const anchor = this.blocksDragAnchor || { x: 0, y: 0 };
                const origin = this.getBlocksPlacementOrigin(row, column, anchor);
                const placementCells = this.getBlocksPlacementCells(piece, origin.row, origin.column);
                if (!placementCells) {
                    this.blocksStatusMessage = 'That piece does not fit there.';
                    this.renderBlocksRound();
                    return;
                }

                this.clearBlocksPlacementPreview();
                this.blocksStatusMessage = '';
                this.applyBlocksPiece(origin.row, origin.column, piece);
                this.blocksHand = this.blocksHand.filter(handPiece => handPiece.id !== piece.id);
                this.blocksPlacedCount += 1;
                this.blocksRoundScore += 1;
                this.blocksTotalScore += 1;
                this.blocksDraggedPieceId = null;
                this.blocksSelectedPieceId = null;

                const completedLines = this.getBlocksCompletedLines();
                const totalCleared = completedLines.rows.length + completedLines.columns.length;
                if (totalCleared > 0) {
                    this.blocksClearingLines = [
                        ...completedLines.rows.map(index => ({ type: 'row', index })),
                        ...completedLines.columns.map(index => ({ type: 'column', index }))
                    ];
                    this.blocksStatusMessage = `${totalCleared} line${totalCleared === 1 ? '' : 's'} clearing...`;
                    this.renderBlocksRound();

                    this.blocksPendingClear = setTimeout(() => {
                        this.blocksPendingClear = null;
                        this.clearBlocksLines(completedLines);
                        const lineBonus = this.calculateBlocksClearBonus(totalCleared);
                        this.blocksRoundScore += lineBonus;
                        this.blocksTotalScore += lineBonus;
                        this.blocksClearingLines = [];
                        this.blocksStatusMessage = `${totalCleared} line${totalCleared === 1 ? '' : 's'} cleared. +${lineBonus} points.`;
                        this.afterBlocksPlacement();
                    }, 260);
                    return;
                }

                this.blocksStatusMessage = `Placed ${piece.name}.`;
                this.afterBlocksPlacement();
            }

            applyBlocksPiece(row, column, piece) {
                piece.cells.forEach(([dx, dy]) => {
                    const targetRow = row + dy;
                    const targetColumn = column + dx;
                    this.blocksBoard[targetRow][targetColumn] = piece.colorIndex;
                });
            }

            getBlocksCompletedLines(board = this.blocksBoard) {
                const rowsToClear = [];
                const columnsToClear = [];

                for (let row = 0; row < this.blocksBoardSize; row++) {
                    if (board[row].every(cell => cell !== null)) {
                        rowsToClear.push(row);
                    }
                }

                for (let column = 0; column < this.blocksBoardSize; column++) {
                    let isFull = true;
                    for (let row = 0; row < this.blocksBoardSize; row++) {
                        if (board[row][column] === null) {
                            isFull = false;
                            break;
                        }
                    }
                    if (isFull) {
                        columnsToClear.push(column);
                    }
                }

                return {
                    rows: rowsToClear,
                    columns: columnsToClear
                };
            }

            cloneBlocksBoard(board = this.blocksBoard) {
                return board.map(row => [...row]);
            }

            applyBlocksPieceToBoard(board, row, column, piece) {
                piece.cells.forEach(([dx, dy]) => {
                    board[row + dy][column + dx] = piece.colorIndex;
                });
            }

            clearBlocksLinesOnBoard(board, lines) {
                lines.rows.forEach(row => {
                    for (let column = 0; column < this.blocksBoardSize; column++) {
                        board[row][column] = null;
                    }
                });

                lines.columns.forEach(column => {
                    for (let row = 0; row < this.blocksBoardSize; row++) {
                        board[row][column] = null;
                    }
                });
            }

            clearBlocksLines(lines) {
                lines.rows.forEach(row => {
                    for (let column = 0; column < this.blocksBoardSize; column++) {
                        this.blocksBoard[row][column] = null;
                    }
                });

                lines.columns.forEach(column => {
                    for (let row = 0; row < this.blocksBoardSize; row++) {
                        this.blocksBoard[row][column] = null;
                    }
                });
            }

            calculateBlocksClearBonus(lineCount) {
                return lineCount * lineCount * 12;
            }

            afterBlocksPlacement() {
                if (this.blocksHand.length === 0) {
                    this.renderBlocksRound();
                    return;
                }

                if (!this.hasAnyPlaysLeft()) {
                    this.renderBlocksRound();
                    this.endBlocksGame('No blocks fit anymore.');
                    return;
                }

                this.renderBlocksRound();
            }

            hasAnyPlaysLeft(board = this.blocksBoard, hand = this.blocksHand) {
                return hand.some(piece => {
                    for (let row = 0; row < this.blocksBoardSize; row++) {
                        for (let column = 0; column < this.blocksBoardSize; column++) {
                            if (this.canPlaceBlocksPieceAtOrigin(row, column, piece, board)) {
                                return true;
                            }
                        }
                    }

                    return false;
                });
            }

            ensureBlocksHandPlacable() {
                return this.hasAnyPlaysLeft();
            }

            findBlocksBestLineToClear() {
                let best = null;

                for (let row = 0; row < this.blocksBoardSize; row++) {
                    let filled = 0;
                    for (let column = 0; column < this.blocksBoardSize; column++) {
                        if (this.blocksBoard[row][column] !== null) {
                            filled += 1;
                        }
                    }

                    if (!best || filled > best.filled) {
                        best = { type: 'row', index: row, filled };
                    }
                }

                for (let column = 0; column < this.blocksBoardSize; column++) {
                    let filled = 0;
                    for (let row = 0; row < this.blocksBoardSize; row++) {
                        if (this.blocksBoard[row][column] !== null) {
                            filled += 1;
                        }
                    }

                    if (!best || filled > best.filled) {
                        best = { type: 'column', index: column, filled };
                    }
                }

                return best;
            }

            clearBlocksLine(type, index) {
                if (type === 'row') {
                    for (let column = 0; column < this.blocksBoardSize; column++) {
                        this.blocksBoard[index][column] = null;
                    }
                } else {
                    for (let row = 0; row < this.blocksBoardSize; row++) {
                        this.blocksBoard[row][index] = null;
                    }
                }
            }

            countBlocksEmptyCells() {
                let emptyCount = 0;
                for (let row = 0; row < this.blocksBoardSize; row++) {
                    for (let column = 0; column < this.blocksBoardSize; column++) {
                        if (this.blocksBoard[row][column] === null) {
                            emptyCount += 1;
                        }
                    }
                }
                return emptyCount;
            }

            isBlocksBoardFull() {
                return this.countBlocksEmptyCells() === 0;
            }

            endBlocksGame(message) {
                if (this.blocksGameOver) {
                    return;
                }

                this.blocksGameOver = true;
                if (this.blocksPendingClear) {
                    clearTimeout(this.blocksPendingClear);
                    this.blocksPendingClear = null;
                }
                if (this.blocksPendingAdvance) {
                    clearTimeout(this.blocksPendingAdvance);
                    this.blocksPendingAdvance = null;
                }
                this.blocksSelectedPieceId = null;
                this.closeBlocksQuestionModal();
                this.blocksStatusMessage = message;
                this.saveToLocalStorage();

                this.showAlert('Blocks Game Over', `${message} Final score: ${this.blocksTotalScore}.`, ['OK']).then(() => {
                    this.renderStudyModeSelection();
                    document.getElementById('studyContentView').style.display = 'none';
                    document.getElementById('resultsView').style.display = 'none';
                });
            }

            submitBlocksAnswer() {
                if (this.blocksHand.length > 0) {
                    return;
                }

                const inputEl = document.getElementById('blocksQuestionInput');
                if (!inputEl || inputEl.disabled) {
                    return;
                }

                const feedbackEl = document.getElementById('blocksQuestionFeedback');
                const guess = this.normalizeStudyText(inputEl.value);
                const answer = this.normalizeStudyText(this.blocksCurrentTerm.definition);
                const isCorrect = guess === answer;

                this.blocksQuestionAttempts += 1;

                if (isCorrect) {
                    const bonus = 20 + Math.max(0, (this.blocksTriesLeft - 1) * 5);
                    this.blocksTotalScore += bonus;
                    this.blocksSolvedCount += 1;
                    this.blocksStatusMessage = `Correct! +${bonus} bonus score.`;

                    if (feedbackEl) {
                        feedbackEl.innerHTML = `<div class="answer-feedback correct">Correct! +${bonus} bonus score.</div>`;
                    }

                    inputEl.disabled = true;
                    this.closeBlocksQuestionModal();
                    this.blocksQueue.shift();

                    this.blocksPendingAdvance = setTimeout(() => {
                        this.blocksPendingAdvance = null;
                        this.startBlocksRound();
                    }, 1000);
                    return;
                }

                this.blocksTriesLeft -= 1;
                if (this.blocksTriesLeft > 0) {
                    if (feedbackEl) {
                        feedbackEl.innerHTML = `<div class="answer-feedback incorrect">Not yet. Try again. ${this.blocksTriesLeft} tries left.</div>`;
                    }
                    inputEl.value = '';
                    inputEl.focus();
                    return;
                }

                const failedTerm = this.blocksQueue.shift();
                if (failedTerm) {
                    this.blocksQueue.push(failedTerm);
                }

                const penalty = Math.min(this.blocksTotalScore, Math.max(5, Math.round(this.blocksRoundScore * 0.5)));
                this.blocksTotalScore = Math.max(0, this.blocksTotalScore - penalty);
                this.blocksStatusMessage = `Out of tries. -${penalty} points. This term will come back later.`;

                if (feedbackEl) {
                    feedbackEl.innerHTML = `<div class="answer-feedback incorrect">Out of tries. You lost ${penalty} points.<div class="correct-answer">Correct answer: ${this.escapeHtml(this.blocksCurrentTerm.definition)}</div></div>`;
                }

                inputEl.disabled = true;
                this.closeBlocksQuestionModal();
                this.blocksPendingAdvance = setTimeout(() => {
                    this.blocksPendingAdvance = null;
                    this.startBlocksRound();
                }, 1000);
            }

            showBlocksQuestionModal() {
                const overlay = document.getElementById('blocksQuestionOverlay');
                const modal = document.getElementById('blocksQuestionModal');
                const titleEl = document.getElementById('blocksQuestionTitle');
                const messageEl = document.getElementById('blocksQuestionMessage');
                const termEl = document.getElementById('blocksQuestionTerm');
                const inputEl = document.getElementById('blocksQuestionInput');
                const triesEl = document.getElementById('blocksQuestionTries');
                const feedbackEl = document.getElementById('blocksQuestionFeedback');

                if (!overlay || !modal || !titleEl || !messageEl || !termEl || !inputEl || !triesEl || !feedbackEl) {
                    return;
                }

                titleEl.textContent = 'Typing question';
                messageEl.textContent = 'Answer the definition to finish the round.';
                termEl.textContent = this.blocksCurrentTerm ? this.blocksCurrentTerm.term : '';
                inputEl.disabled = false;
                inputEl.value = '';
                inputEl.placeholder = 'Type the definition...';
                triesEl.textContent = `Tries left: ${this.blocksTriesLeft}`;
                feedbackEl.innerHTML = '';
                overlay.classList.add('show');
                modal.style.display = 'block';
                inputEl.onkeydown = (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        this.submitBlocksAnswer();
                    }
                };

                setTimeout(() => inputEl.focus(), 0);
            }

            closeBlocksQuestionModal() {
                const overlay = document.getElementById('blocksQuestionOverlay');
                const modal = document.getElementById('blocksQuestionModal');
                if (overlay) {
                    overlay.classList.remove('show');
                }
                if (modal) {
                    modal.style.display = 'none';
                }
            }

            renderStudyContent() {
                const studyContent = document.getElementById('studyContent');
                const currentTerm = this.currentSet.terms[this.currentIndex];

                this.updateProgressBar();

                if (this.currentMode === 'flashcard') {
                    studyContent.innerHTML = `
                        <div class="flashcard" onclick="app.toggleFlashcard()">
                            <div class="flashcard-hint" id="flipHint">Click to reveal</div>
                            <div class="flashcard-content" id="flashcardContent">${this.escapeHtml(currentTerm.term)}</div>
                            <div class="flashcard-counter">${this.currentIndex + 1} / ${this.currentSet.terms.length}</div>
                        </div>
                        <div class="flashcard-buttons">
                            <button class="btn vocab-btn btn-danger" onclick="app.submitFlashcardAnswer('incorrect')">Incorrect</button>
                            <button class="btn vocab-btn" onclick="app.submitFlashcardAnswer('skip')">Skip</button>
                            <button class="btn vocab-btn btn-success" onclick="app.submitFlashcardAnswer('correct')">Correct</button>
                        </div>
                    `;
                    this.flashcardFlipped = false;
                } else if (this.currentMode === 'multichoice') {
                    const options = this.generateMultipleChoiceOptions(currentTerm);
                    let choicesHtml = '';
                    options.forEach((option, idx) => {
                        choicesHtml += `<div class="choice-option" data-index="${idx}" onclick="app.submitMultipleChoice(${idx}, ${option.correct})">${this.escapeHtml(option.text)}</div>`;
                    });
                    studyContent.innerHTML = `
                        <div style="margin-bottom: 30px;">
                            <h4 class="w-txt mb-4">${this.escapeHtml(currentTerm.term)}</h4>
                            ${choicesHtml}
                            <div id="studyFeedback"></div>
                        </div>
                    `;
                } else if (this.currentMode === 'typing') {
                    studyContent.innerHTML = `
                        <div class="typing-container">
                            <h4 class="w-txt mb-3">${this.escapeHtml(currentTerm.term)}</h4>
                            <input type="text" class="typing-input" id="typingInput" placeholder="Type the definition..." onkeypress="event.key === 'Enter' && app.submitTypingAnswer()">
                            <div style="display: flex; gap: 10px;">
                                <button class="btn vocab-btn" onclick="app.submitTypingAnswer()">Submit</button>
                                <button class="btn vocab-btn btn-secondary" onclick="app.revealAnswer()">Reveal</button>
                            </div>
                            <div id="revealedAnswer" style="display: none; margin-top: 20px; padding: 15px; background-color: rgba(255,255,255,0.08); border-radius: 8px;">
                                <small style="color: rgba(255,255,255,0.6);">Correct answer:</small>
                                <div style="color: white; font-weight: 600; margin-top: 8px;">${this.escapeHtml(currentTerm.definition)}</div>
                            </div>
                            <div id="studyFeedback" style="margin-top: 12px;"></div>
                        </div>
                    `;
                    setTimeout(() => document.getElementById('typingInput').focus(), 0);
                } else if (this.currentMode === 'learning') {
                    this.renderLearningCard();
                }
            }

            renderLearningCard() {
                const studyContent = document.getElementById('studyContent');
                const currentItem = this.learningQueue[0];

                if (!currentItem) {
                    this.finishStudySession();
                    return;
                }

                this.updateProgressBar();

                let interactionHtml = '';
                if (this.learningConfig.inputMode === 'typing') {
                    interactionHtml = `
                        <div class="learning-answer-input">
                            <input type="text" class="typing-input" id="learningTypingInput" placeholder="Type the ${currentItem.answerField}" onkeypress="event.key === 'Enter' && app.submitLearningTypingAnswer()">
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                <button class="btn vocab-btn btn-success" onclick="app.submitLearningTypingAnswer()">
                                    <i class="bi bi-check-circle-fill btn-icon" aria-hidden="true"></i>Submit
                                </button>
                            </div>
                            <div class="learning-feedback" id="learningFeedback"></div>
                            <div class="learning-actions" id="learningNextActions" style="display: none;"></div>
                        </div>
                    `;
                } else {
                    const options = this.generateLearningMultipleChoiceOptions(currentItem);
                    const choicesHtml = options.map((option, index) => `
                        <div class="choice-option" data-learning-choice="${index}" onclick="app.submitLearningChoice(${index}, ${option.correct})">${this.escapeHtml(option.text)}</div>
                    `).join('');

                    interactionHtml = `
                        <div class="learning-answer-input">
                            ${choicesHtml}
                            <div class="learning-feedback" id="learningFeedback"></div>
                            <div class="learning-actions" id="learningNextActions" style="display: none;"></div>
                        </div>
                    `;
                }

                studyContent.innerHTML = `
                    <div class="learning-card">
                        <div class="learning-stats">
                            <div class="stat-box">
                                <div class="stat-value">${this.learningMastered}</div>
                                <div class="stat-label">Mastered</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${this.learningQueue.length}</div>
                                <div class="stat-label">Remaining</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${this.learningTotal}</div>
                                <div class="stat-label">Total Cards</div>
                            </div>
                        </div>
                        <div class="learning-badge">
                            <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
                            ${this.escapeHtml(currentItem.label)}
                        </div>
                        <div class="learning-prompt">
                            <div class="learning-prompt-label">${this.escapeHtml(currentItem.promptField)}</div>
                            <div class="learning-prompt-value">${this.escapeHtml(currentItem.promptText)}</div>
                            <div class="learning-support">Answer with the ${this.escapeHtml(currentItem.answerField)}.</div>
                        </div>
                        ${interactionHtml}
                    </div>
                `;

                if (this.learningConfig.inputMode === 'typing') {
                    setTimeout(() => {
                        const typingInput = document.getElementById('learningTypingInput');
                        if (typingInput) {
                            typingInput.focus();
                        }
                    }, 0);
                }
            }

            generateLearningMultipleChoiceOptions(currentItem) {
                const correctAnswer = currentItem.answerText;
                const options = [{ text: correctAnswer, correct: true }];
                const seen = new Set([this.normalizeStudyText(correctAnswer)]);

                const otherAnswers = this.currentSet.terms
                    .filter(term => term.id !== currentItem.termId)
                    .map(term => term[currentItem.answerField])
                    .filter(Boolean);

                while (options.length < 4 && otherAnswers.length > 0) {
                    const randomIndex = Math.floor(Math.random() * otherAnswers.length);
                    const candidate = otherAnswers.splice(randomIndex, 1)[0];
                    const normalizedCandidate = this.normalizeStudyText(candidate);

                    if (seen.has(normalizedCandidate)) {
                        continue;
                    }

                    seen.add(normalizedCandidate);
                    options.push({ text: candidate, correct: false });
                }

                return options.sort(() => Math.random() - 0.5);
            }

            normalizeStudyText(text) {
                return (text || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
            }

            submitLearningTypingAnswer() {
                const inputEl = document.getElementById('learningTypingInput');
                if (!inputEl || inputEl.disabled) {
                    return;
                }

                const currentItem = this.learningQueue[0];
                if (!currentItem) {
                    return;
                }

                const isCorrect = this.normalizeStudyText(inputEl.value) === this.normalizeStudyText(currentItem.answerText);
                this.handleLearningAttempt(isCorrect, currentItem);
            }

            submitLearningChoice(optionIndex, isCorrect) {
                const options = document.querySelectorAll('[data-learning-choice]');
                options.forEach(option => {
                    option.classList.add('disabled');
                    option.onclick = null;
                });

                const selected = document.querySelector(`[data-learning-choice="${optionIndex}"]`);
                if (selected) {
                    selected.classList.add(isCorrect ? 'correct' : 'incorrect');
                }

                this.handleLearningAttempt(isCorrect, this.learningQueue[0], true);
            }

            handleLearningAttempt(isCorrect, currentItem) {
                const feedbackEl = document.getElementById('learningFeedback');
                const inputEl = document.getElementById('learningTypingInput');
                const nextActionsEl = document.getElementById('learningNextActions');
                const activeItem = this.learningQueue.shift() || currentItem;

                if (this.learningPendingFeedback) {
                    clearTimeout(this.learningPendingFeedback);
                    this.learningPendingFeedback = null;
                }

                this.learningAttemptCount += 1;

                if (isCorrect) {
                    this.learningMastered += 1;
                    if (feedbackEl) {
                        feedbackEl.innerHTML = `<div class="answer-feedback correct">Correct! This card is mastered.</div>`;
                    }
                    if (nextActionsEl) {
                        nextActionsEl.style.display = 'none';
                        nextActionsEl.innerHTML = '';
                    }
                    this.updateProgressBar();

                    this.learningPendingFeedback = setTimeout(() => {
                        this.learningPendingFeedback = null;
                        if (this.learningQueue.length === 0) {
                            this.finishStudySession();
                        } else {
                            this.renderLearningCard();
                        }
                    }, 1000);
                    return;
                } else {
                    this.learningQueue.push(activeItem);
                    if (feedbackEl) {
                        feedbackEl.innerHTML = `<div class="answer-feedback incorrect">Not yet. This card will repeat until you get it right.<div class="correct-answer">Correct answer: ${this.escapeHtml(activeItem.answerText)}</div></div>`;
                    }
                    if (nextActionsEl) {
                        nextActionsEl.style.display = 'flex';
                        nextActionsEl.innerHTML = `
                            <button class="btn vocab-btn mt-3" onclick="app.advanceLearningCard()">
                                <i class="bi bi-arrow-right-circle-fill btn-icon" aria-hidden="true"></i>Next
                            </button>
                        `;
                    }
                }

                if (inputEl) {
                    inputEl.disabled = true;
                }

                this.updateProgressBar();
            }

            advanceLearningCard() {
                if (this.learningPendingFeedback) {
                    clearTimeout(this.learningPendingFeedback);
                    this.learningPendingFeedback = null;
                }

                if (this.learningQueue.length === 0) {
                    this.finishStudySession();
                    return;
                }

                this.renderLearningCard();
            }

            toggleFlashcard() {
                if (this.isFlipping) {
                    return;
                }

                const card = document.querySelector('.flashcard');
                if (!card) {
                    return;
                }

                this.isFlipping = true;
                card.classList.add('flipping');

                if (!this.flashcardFlipped) {
                    setTimeout(() => {
                        const currentTerm = this.currentSet.terms[this.currentIndex];
                        document.getElementById('flashcardContent').textContent = currentTerm.definition;
                        document.getElementById('flipHint').textContent = 'Click to flip back';
                        this.flashcardFlipped = true;
                        card.classList.add('flipped');
                    }, 225);
                } else {
                    setTimeout(() => {
                        const currentTerm = this.currentSet.terms[this.currentIndex];
                        document.getElementById('flashcardContent').textContent = currentTerm.term;
                        document.getElementById('flipHint').textContent = 'Click to reveal';
                        this.flashcardFlipped = false;
                        card.classList.remove('flipped');
                    }, 225);
                }

                setTimeout(() => {
                    card.classList.remove('flipping');
                    this.isFlipping = false;
                }, 450);
            }

            generateMultipleChoiceOptions(currentTerm) {
                const options = [{ text: currentTerm.definition, correct: true }];
                const availableTerms = this.currentSet.terms.filter(t => t.id !== currentTerm.id);
                
                while (options.length < 4 && availableTerms.length > 0) {
                    const randomIdx = Math.floor(Math.random() * availableTerms.length);
                    options.push({ text: availableTerms[randomIdx].definition, correct: false });
                    availableTerms.splice(randomIdx, 1);
                }

                return options.sort(() => Math.random() - 0.5);
            }

            submitFlashcardAnswer(result) {
                if (result === 'correct') this.studyResults.correct++;
                else if (result === 'incorrect') this.studyResults.incorrect++;
                else this.studyResults.skipped++;

                this.nextCard();
            }

            submitMultipleChoice(optionIndex, isCorrect) {
                const options = document.querySelectorAll('.choice-option');
                options.forEach(option => {
                    option.classList.add('disabled');
                    option.onclick = null;
                });

                const selected = document.querySelector(`.choice-option[data-index="${optionIndex}"]`);
                const correctDefinition = this.currentSet.terms[this.currentIndex].definition;
                const correctOption = Array.from(options).find(el => el.textContent.trim() === correctDefinition);

                if (selected) {
                    selected.classList.add(isCorrect ? 'correct' : 'incorrect');
                }
                if (correctOption && !isCorrect) {
                    correctOption.classList.add('correct');
                }

                const feedbackEl = document.getElementById('studyFeedback');
                if (isCorrect) {
                    this.studyResults.correct++;
                    feedbackEl.innerHTML = `<div class="answer-feedback correct">Correct! Nice work.</div>`;
                } else {
                    this.studyResults.incorrect++;
                    feedbackEl.innerHTML = `<div class="answer-feedback incorrect">Incorrect.<div class="correct-answer">Correct answer: ${this.escapeHtml(correctDefinition)}</div></div>`;
                }

                feedbackEl.innerHTML += `<button class="btn vocab-btn mt-3" onclick="app.nextCard()">Next</button>`;
            }

            submitTypingAnswer() {
                const input = document.getElementById('typingInput').value.trim().toLowerCase();
                const correctDefinition = this.currentSet.terms[this.currentIndex].definition;
                const correct = correctDefinition.toLowerCase();
                const submitBtn = document.querySelector('#studyContent .btn.vocab-btn');
                const typingInput = document.getElementById('typingInput');
                const feedbackEl = document.getElementById('studyFeedback');

                if (!typingInput || typingInput.disabled) {
                    return;
                }

                typingInput.disabled = true;
                if (submitBtn) {
                    submitBtn.disabled = true;
                }

                if (input === correct) {
                    this.studyResults.correct++;
                    feedbackEl.innerHTML = `<div class="answer-feedback correct">Correct! Great answer.</div>`;
                } else {
                    this.studyResults.incorrect++;
                    feedbackEl.innerHTML = `<div class="answer-feedback incorrect">Incorrect.<div class="correct-answer">Correct answer: ${this.escapeHtml(correctDefinition)}</div></div>`;
                }

                feedbackEl.innerHTML += `<button class="btn vocab-btn mt-3" onclick="app.nextCard()">Next</button>`;
            }

            revealAnswer() {
                document.getElementById('revealedAnswer').style.display = 'block';
            }

            nextLearningCard() {
                this.currentIndex++;
                if (this.currentIndex >= this.currentSet.terms.length) {
                    this.finishStudySession();
                } else {
                    this.renderStudyContent();
                }
            }

            nextCard() {
                this.currentIndex++;
                if (this.currentIndex >= this.currentSet.terms.length) {
                    this.finishStudySession();
                } else {
                    this.renderStudyContent();
                }
            }

            updateProgressBar() {
                let progress = (this.currentIndex / this.currentSet.terms.length) * 100;
                let progressText = `Card ${this.currentIndex + 1} of ${this.currentSet.terms.length}`;

                if (this.currentMode === 'learning') {
                    const completed = this.learningTotal - this.learningQueue.length;
                    progress = this.learningTotal > 0 ? (completed / this.learningTotal) * 100 : 0;
                    progressText = `Mastered ${this.learningMastered} of ${this.learningTotal}`;
                } else if (this.currentMode === 'blocks') {
                    progress = this.blocksTotalTerms > 0 ? (this.blocksSolvedCount / this.blocksTotalTerms) * 100 : 0;
                    progressText = `Solved ${this.blocksSolvedCount} of ${this.blocksTotalTerms} | Score ${this.blocksTotalScore}`;
                }

                document.getElementById('progressBar').style.width = progress + '%';
                document.getElementById('progressText').textContent = progressText;
            }

            finishStudySession() {
                if (this.currentMode === 'learning') {
                    this.currentSet.stats.studied += 1;
                    this.saveToLocalStorage();
                    const bothDirections = this.learningConfig.directions.termToDefinition && this.learningConfig.directions.definitionToTerm;
                    this.showAlert('Learning Complete', `Nice work. You mastered every card${bothDirections ? ' in both directions' : ''}.`).then(() => {
                        this.renderStudyModeSelection();
                        document.getElementById('studyContentView').style.display = 'none';
                        document.getElementById('resultsView').style.display = 'none';
                    });
                    return;
                } else if (this.currentMode === 'blocks') {
                    this.currentSet.stats.studied += 1;
                    this.currentSet.stats.accuracy = this.blocksTotalTerms > 0 ? Math.round((this.blocksSolvedCount / this.blocksTotalTerms) * 100) : 0;
                    this.saveToLocalStorage();
                    this.showAlert('Blocks Complete', `You cleared ${this.blocksSolvedCount} of ${this.blocksTotalTerms} terms and finished with ${this.blocksTotalScore} points.`, ['OK']).then(() => {
                        this.renderStudyModeSelection();
                        document.getElementById('studyContentView').style.display = 'none';
                        document.getElementById('resultsView').style.display = 'none';
                    });
                    return;
                }

                const total = this.currentSet.terms.length;
                const accuracy = Math.round((this.studyResults.correct / total) * 100);

                this.currentSet.stats.studied += 1;
                this.currentSet.stats.accuracy = accuracy;
                this.saveToLocalStorage();

                document.getElementById('accuracyScore').textContent = accuracy + '%';
                document.getElementById('correctCount').textContent = this.studyResults.correct;
                document.getElementById('incorrectCount').textContent = this.studyResults.incorrect;
                document.getElementById('skippedCount').textContent = this.studyResults.skipped;

                document.getElementById('studyContentView').style.display = 'none';
                document.getElementById('resultsView').style.display = 'block';
            }

            escapeHtml(text) {
                const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
                return text.replace(/[&<>"']/g, m => map[m]);
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            app = new VocabularyApp();
        });
