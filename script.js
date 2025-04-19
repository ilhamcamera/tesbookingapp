// Konfigurasi Aplikasi
const CONFIG = {
    googleScriptUrl: 'https://script.google.com/macros/s/AKfycbx8Ys03XP2VU_Jc-hrkg2tqx6ARzXsV5LndosC4zLvVYq7FteoihxLKIVauYFSc-HAz/exec',
    unitsJsonPath: 'units.json'
};

// State Aplikasi
const state = {
    bookingData: {},
    units: [],
    categories: [],
    selectedUnit: null,
    selectedDate: null,
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    filterPanelOpen: false,
    scrollPosition: 0,
    touchStartX: 0,
    touchStartY: 0
};

// Cache DOM Elements
const elements = {
    bookingMatrix: document.getElementById('bookingMatrix'),
    dateHeaderRow: document.getElementById('dateHeaderRow'),
    matrixBody: document.getElementById('matrixBody'),
    monthYearDisplay: document.getElementById('monthYearDisplay'),
    prevMonthBtn: document.getElementById('prevMonth'),
    nextMonthBtn: document.getElementById('nextMonth'),
    refreshBtn: document.getElementById('refreshBtn'),
    filterBtn: document.getElementById('filterBtn'),
    filterPanel: document.getElementById('filterPanel'),
    closeFilterBtn: document.getElementById('closeFilterBtn'),
    bookingModal: document.getElementById('bookingModal'),
    filterStatus: document.getElementById('filterStatus'),
    filterUnit: document.getElementById('filterUnit'),
    filterCategory: document.getElementById('filterCategory'),
    tableContainer: document.querySelector('.table-container')
};

// Utility Functions
const utils = {
    formatDate: (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    parseDate: (dateStr) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    },

    formatFullDate: (dateStr) => {
        const date = utils.parseDate(dateStr);
        return date.toLocaleDateString('id-ID', { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });
    },

    isToday: (date) => {
        const today = new Date();
        return date.getDate() === today.getDate() && 
               date.getMonth() === today.getMonth() && 
               date.getFullYear() === today.getFullYear();
    },

    getDaysInMonth: (year, month) => new Date(year, month + 1, 0).getDate(),

    debounce: (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    },

    calculateCellWidth: () => {
        const containerWidth = document.querySelector('.container').clientWidth;
        const daysInMonth = utils.getDaysInMonth(state.currentYear, state.currentMonth);
        const unitColumnWidth = 100;
        const minCellWidth = 40;
        const availableWidth = containerWidth - unitColumnWidth - 20;
        return Math.max(minCellWidth, Math.floor(availableWidth / daysInMonth));
    },

    isPastDate: (dateStr) => {
        const selectedDate = utils.parseDate(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selectedDate < today;
    }
};

// Core Functions
const core = {
    loadUnits: async () => {
        try {
            const response = await fetch(CONFIG.unitsJsonPath);
            if (!response.ok) throw new Error('Failed to load units.json');
            
            const data = await response.json();
            
            const nameCount = {};
            const processedUnits = [];
            
            data.units.forEach(unit => {
                nameCount[unit.name] = (nameCount[unit.name] || 0) + 1;
            });
            
            const nameIndex = {};
            data.units.forEach(unit => {
                let displayName = unit.name;
                if (nameCount[unit.name] > 1) {
                    nameIndex[unit.name] = (nameIndex[unit.name] || 0) + 1;
                    displayName = `${unit.name} (${nameIndex[unit.name]})`;
                }
                
                processedUnits.push({
                    originalName: unit.name,
                    displayName: displayName,
                    category: unit.category
                });
            });
            
            state.units = processedUnits;
            state.categories = data.categories;
            return { units: state.units, categories: state.categories };
        } catch (error) {
            console.error('Error loading units:', error);
            throw error;
        }
    },

    loadBookingData: async () => {
        if (elements.loadingIndicator) {
            elements.loadingIndicator.classList.remove('hidden');
        }
        elements.matrixBody.innerHTML = '<tr><td colspan="100%" class="p-4 text-center">Memuat data...</td></tr>';
        
        try {
            const timestamp = Date.now();
            const url = `${CONFIG.googleScriptUrl}?action=getBookings&month=${state.currentMonth + 1}&year=${state.currentYear}&t=${timestamp}`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('Gagal memuat data');
            
            const data = await response.json();
            if (!data?.success) throw new Error(data?.message || 'Format data tidak valid');
            
            state.bookingData = {};
            Object.entries(data.data).forEach(([key, value]) => {
                if (value) {
                    state.bookingData[key] = {
                        date: value.date,
                        unit: value.unit,
                        description: value.description || '',
                        status: value.status || 'available'
                    };
                }
            });
            
            core.generateMatrix();
        } catch (error) {
            console.error('Error:', error);
            elements.matrixBody.innerHTML = `<tr><td colspan="100%" class="p-4 text-center text-red-700">Error: ${error.message}</td></tr>`;
        } finally {
            if (elements.loadingIndicator) {
                elements.loadingIndicator.classList.add('hidden');
            }
        }
    },

    generateDateHeaders: () => {
        while (elements.dateHeaderRow.children.length > 1) {
            elements.dateHeaderRow.removeChild(elements.dateHeaderRow.lastChild);
        }
        
        const daysInMonth = utils.getDaysInMonth(state.currentYear, state.currentMonth);
        const cellWidth = utils.calculateCellWidth();
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(state.currentYear, state.currentMonth, day);
            const dateStr = utils.formatDate(date);
            
            const th = document.createElement('th');
            th.className = `date-header bg-white sticky top-0 z-25 p-2 text-center font-medium border border-gray-300 ${utils.isToday(date) ? 'font-bold text-red-800' : ''}`;
            th.textContent = day;
            th.dataset.date = dateStr;
            th.style.minWidth = `${cellWidth}px`;
            elements.dateHeaderRow.appendChild(th);
        }
    },

    generateMatrix: () => {
        const monthName = new Date(state.currentYear, state.currentMonth, 1)
            .toLocaleString('id-ID', { month: 'long' });
        elements.monthYearDisplay.textContent = `${monthName} ${state.currentYear}`;
        
        core.generateDateHeaders();
        elements.matrixBody.innerHTML = '';
        
        const selectedCategory = elements.filterCategory.value;
        const selectedUnitDisplayName = elements.filterUnit.selectedOptions[0]?.dataset.displayName;
        const selectedStatus = elements.filterStatus.value;
        
        let filteredUnits = state.units;
        
        if (selectedCategory !== 'Semua') {
            filteredUnits = filteredUnits.filter(unit => unit.category === selectedCategory);
        }
        
        if (selectedUnitDisplayName && selectedUnitDisplayName !== 'all') {
            filteredUnits = filteredUnits.filter(unit => unit.displayName === selectedUnitDisplayName);
        }
        
        filteredUnits.sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        const cellWidth = utils.calculateCellWidth();
        
        filteredUnits.forEach(unit => {
            const row = document.createElement('tr');
            const unitCell = document.createElement('td');
            unitCell.textContent = unit.displayName;
            unitCell.className = 'unit-cell bg-white sticky left-0 z-30 p-2 font-medium border border-gray-300 min-w-[100px] max-w-[100px] break-words text-sm';
            row.appendChild(unitCell);
            
            const daysInMonth = utils.getDaysInMonth(state.currentYear, state.currentMonth);
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(state.currentYear, state.currentMonth, day);
                const dateStr = utils.formatDate(date);
                const unitDateKey = `${unit.originalName}_${dateStr}`;
                
                const cell = document.createElement('td');
                cell.className = `date-cell border border-gray-300 p-1 text-center text-xs min-w-[${cellWidth}px] h-12 relative ${utils.isToday(date) ? 'font-bold text-red-800' : ''}`;
                
                const booking = state.bookingData[unitDateKey];
                const description = booking?.description || '';
                
                if (booking && (selectedStatus === 'all' || booking.status === selectedStatus)) {
                    cell.className += ` ${booking.status === 'booked' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-green-600'}`;
                    if (description) {
                        cell.innerHTML = `
                            <div class="description text-[0.65rem] break-words line-clamp-2 overflow-hidden" title="${description}">${description}</div>
                        `;
                    }
                } else if (!booking && (selectedStatus === 'all' || selectedStatus === 'available')) {
                    cell.className += ' bg-blue-50 text-green-600';
                    if (description) {
                        cell.innerHTML = `
                            <div class="description text-[0.65rem] break-words line-clamp-2 overflow-hidden" title="${description}">${description}</div>
                        `;
                    }
                }
                
                cell.dataset.unit = unit.originalName;
                cell.dataset.date = dateStr;
                
                if (cell.classList.contains('bg-blue-50') && !utils.isPastDate(dateStr)) {
                    cell.className += ' cursor-pointer hover:bg-red-100';
                    cell.addEventListener('click', () => core.openBookingModal(unit.originalName, dateStr));
                }
                
                if (utils.isToday(date)) {
                    cell.innerHTML += '<div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-5 h-0.5 bg-red-800"></div>';
                }
                
                row.appendChild(cell);
            }
            elements.matrixBody.appendChild(row);
        });
    },

    populateCategoryFilter: () => {
        elements.filterCategory.innerHTML = '<option value="Semua">Semua</option>';
        state.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            elements.filterCategory.appendChild(option);
        });
    },

    populateUnitFilter: () => {
        const selectedCategory = elements.filterCategory.value;
        elements.filterUnit.innerHTML = '<option value="all" data-display-name="all">Semua Barang</option>';
        
        const unitsToShow = selectedCategory === 'Semua' 
            ? state.units 
            : state.units.filter(unit => unit.category === selectedCategory);
        
        unitsToShow.sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        unitsToShow.forEach(unit => {
            const option = document.createElement('option');
            option.value = unit.originalName;
            option.textContent = unit.displayName;
            option.dataset.displayName = unit.displayName;
            elements.filterUnit.appendChild(option);
        });
    },

    openBookingModal: (unit, dateStr) => {
        const selectedDate = utils.parseDate(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate < today) {
            alert('Tanggal yang dipilih sudah berlalu. Silakan pilih tanggal hari ini atau yang akan datang.');
            return;
        }
        
        console.log('Opening modal for unit:', unit, 'date:', dateStr);
        
        state.scrollPosition = window.scrollY || window.pageYOffset;
        
        document.getElementById('selectedUnit').value = unit;
        document.getElementById('selectedDate').value = dateStr;
        document.getElementById('displayUnit').textContent = unit;
        document.getElementById('displayDate').textContent = utils.formatFullDate(dateStr);
        
        const date = utils.parseDate(dateStr);
        const returnDate = new Date(date);
        returnDate.setDate(returnDate.getDate() + 1);
        
        document.getElementById('returnDate').value = utils.formatDate(returnDate);
        document.getElementById('pickupTime').value = '08:00';
        document.getElementById('returnTime').value = '17:00';
        
        document.getElementById('bookingForm').reset();
        document.getElementById('selectedUnit').value = unit;
        document.getElementById('selectedDate').value = dateStr;
        document.getElementById('displayUnit').textContent = unit;
        document.getElementById('displayDate').textContent = utils.formatFullDate(dateStr);
        document.getElementById('returnDate').value = utils.formatDate(returnDate);
        document.getElementById('pickupTime').value = '08:00';
        document.getElementById('returnTime').value = '17:00';
        document.getElementById('documentsError').classList.add('hidden');
        
        elements.bookingModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        document.body.style.position = 'fixed';
        document.body.style.top = `-${state.scrollPosition}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
        
        // iOS-specific fix
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            setTimeout(() => {
                const modalDialog = elements.bookingModal.querySelector('.modal-dialog');
                const modalBody = elements.bookingModal.querySelector('.modal-body');
                const inputs = modalBody.querySelectorAll('input, textarea, select, button');
                
                modalDialog.style.transform = 'translateZ(0)';
                modalDialog.style.webkitTransform = 'translateZ(0)';
                modalDialog.style.overflow = 'auto';
                modalDialog.style.webkitOverflowScrolling = 'touch';
                
                modalBody.style.touchAction = 'auto';
                modalBody.style.overflow = 'auto';
                modalBody.style.webkitOverflowScrolling = 'touch';
                
                inputs.forEach(input => {
                    input.style.pointerEvents = 'auto';
                    input.style.touchAction = 'manipulation';
                    input.style.webkitUserSelect = 'auto';
                    input.style.userSelect = 'auto';
                });
                
                const firstInput = document.getElementById('pickupTime');
                if (firstInput) firstInput.focus();
                
                modalDialog.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
                modalDialog.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
            }, 100);
        }
    },

    closeBookingModal: () => {
        elements.bookingModal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, state.scrollPosition || 0);
    },

    toggleFilterPanel: () => {
        state.filterPanelOpen = !state.filterPanelOpen;
        elements.filterPanel.classList.toggle('open', state.filterPanelOpen);
        elements.filterPanel.classList.toggle('translate-x-full', !state.filterPanelOpen);
        if (state.filterPanelOpen) {
            state.scrollPosition = window.scrollY || window.pageYOffset;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${state.scrollPosition}px`;
            document.body.style.width = '100%';
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            window.scrollTo(0, state.scrollPosition || 0);
        }
    },

    handleWindowResize: utils.debounce(() => {
        if (elements.matrixBody.children.length > 0 && !state.filterPanelOpen) {
            core.generateMatrix();
        }
    }, 500)
};

// Handle form submission
document.getElementById('bookingForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const documents = Array.from(document.querySelectorAll('input[name="documents"]:checked')).map(cb => cb.value);
    if (documents.length < 3) {
        document.getElementById('documentsError').classList.remove('hidden');
        return;
    }
    
    const formData = {
        unit: document.getElementById('selectedUnit').value,
        date: document.getElementById('selectedDate').value,
        pickupTime: document.getElementById('pickupTime').value,
        returnDate: document.getElementById('returnDate').value,
        returnTime: document.getElementById('returnTime').value,
        name: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        address: document.getElementById('customerAddress').value,
        documents: documents.join(', ')
    };
    
    const whatsappMessage = `Halo, saya ${formData.name} ingin menyewa barang berikut:
    
*Detail Penyewaan:*
Barang: ${formData.unit}
Tanggal Sewa: ${utils.formatFullDate(formData.date)} jam ${formData.pickupTime}
Tanggal Kembali: ${utils.formatFullDate(formData.returnDate)} jam ${formData.returnTime}

*Data Diri:*
Nama: ${formData.name}
Telepon: ${formData.phone}
Alamat: ${formData.address}

*Dokumen Jaminan:*
${formData.documents}

Mohon konfirmasi ketersediaannya. Terima kasih.`;
    
    const encodedMessage = encodeURIComponent(whatsappMessage);
    const whatsappLink = `https://wa.me/628999240196?text=${encodedMessage}`;
    
    window.open(whatsappLink, '_blank');
    core.closeBookingModal();
});

// Event Handlers
const handlers = {
    onPrevMonth: () => {
        state.currentMonth--;
        if (state.currentMonth < 0) {
            state.currentMonth = 11;
            state.currentYear--;
        }
        core.loadBookingData();
    },

    onNextMonth: () => {
        state.currentMonth++;
        if (state.currentMonth > 11) {
            state.currentMonth = 0;
            state.currentYear++;
        }
        core.loadBookingData();
    },

    onRefresh: async () => {
        try {
            if (elements.loadingIndicator) {
                elements.loadingIndicator.classList.remove('hidden');
            }
            await core.loadUnits();
            core.populateCategoryFilter();
            core.populateUnitFilter();
            await core.loadBookingData();
        } finally {
            if (elements.loadingIndicator) {
                elements.loadingIndicator.classList.add('hidden');
            }
        }
    },

    onCategoryChange: () => {
        core.populateUnitFilter();
        core.generateMatrix();
    },

    onTouchStart: (e) => {
        state.touchStartX = e.touches[0].clientX;
        state.touchStartY = e.touches[0].clientY;
    },

    onTouchMove: (e) => {
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const deltaX = state.touchStartX - touchX;
        const deltaY = state.touchStartY - touchY;

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            e.preventDefault();
            elements.tableContainer.scrollLeft += deltaX * 1;
        }
    }
};

// Initialize Application
const init = async () => {
    const now = new Date();
    state.currentMonth = now.getMonth();
    state.currentYear = now.getFullYear();
    
    try {
        if (elements.loadingIndicator) {
            elements.loadingIndicator.classList.remove('hidden');
        }
        await core.loadUnits();
        core.populateCategoryFilter();
        core.populateUnitFilter();
        await core.loadBookingData();
    } catch (error) {
        console.error('Initialization error:', error);
        elements.matrixBody.innerHTML = `<tr><td colspan="100%" class="p-4 text-center text-red-700">Error: Gagal menginisialisasi aplikasi</td></tr>`;
    } finally {
        if (elements.loadingIndicator) {
            elements.loadingIndicator.classList.add('hidden');
        }
    }
    
    elements.prevMonthBtn.addEventListener('click', handlers.onPrevMonth);
    elements.nextMonthBtn.addEventListener('click', handlers.onNextMonth);
    elements.refreshBtn.addEventListener('click', handlers.onRefresh);
    elements.filterBtn.addEventListener('click', core.toggleFilterPanel);
    elements.closeFilterBtn.addEventListener('click', core.toggleFilterPanel);
    elements.filterStatus.addEventListener('change', core.generateMatrix);
    elements.filterCategory.addEventListener('change', handlers.onCategoryChange);
    elements.filterUnit.addEventListener('change', core.generateMatrix);
    
    document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
        btn.addEventListener('click', core.closeBookingModal);
    });
    
    elements.tableContainer.addEventListener('touchstart', handlers.onTouchStart);
    elements.tableContainer.addEventListener('touchmove', handlers.onTouchMove, { passive: false });
    
    window.addEventListener('resize', core.handleWindowResize);
};

document.addEventListener('DOMContentLoaded', init);