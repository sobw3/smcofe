document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://localhost:3000';
    const state = {}; // Armazena todos os dados do dashboard

    // --- ELEMENTOS DO DOM ---
    const views = { login: document.getElementById('login-view'), panel: document.getElementById('admin-panel') };
    const sections = {
        dashboard: document.getElementById('dashboard-section'), dosages: document.getElementById('dosages-section'),
        inventory: document.getElementById('inventory-section'), sales: document.getElementById('sales-section'),
        settings: document.getElementById('settings-section')
    };
    const navLinks = document.querySelectorAll('#sidebar-nav .nav-link');

    // --- FUNÇÕES DE API ---
    const apiFetch = async (endpoint, options = {}) => {
        const token = localStorage.getItem('authToken');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
        if (response.status === 401 || response.status === 403) {
            logout();
            return null;
        }
        if (!response.ok) {
            const err = await response.json();
            alert(`Erro: ${err.error || 'Ocorreu um problema.'}`);
            return null;
        }
        return response.json();
    };

    // --- LÓGICA DE AUTENTICAÇÃO E NAVEGAÇÃO ---
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('password').value;
        const result = await apiFetch('/admin/login', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
        if (result && result.token) {
            localStorage.setItem('authToken', result.token);
            views.login.classList.add('hidden');
            views.panel.classList.remove('hidden');
            loadAllDashboardData();
        } else {
            document.getElementById('login-error').textContent = 'Senha incorreta.';
        }
    });

    const logout = () => {
        localStorage.removeItem('authToken');
        views.panel.classList.add('hidden');
        views.login.classList.remove('hidden');
    };
    document.getElementById('logout-btn').addEventListener('click', logout);

    const showTab = (hash) => {
        const targetId = (hash || '#dashboard').substring(1) + '-section';
        Object.values(sections).forEach(s => s.classList.remove('active'));
        navLinks.forEach(l => l.classList.remove('active'));
        
        const activeSection = document.getElementById(targetId);
        const activeLink = document.querySelector(`a[href="${hash || '#dashboard'}"]`);
        if(activeSection) activeSection.classList.add('active');
        if(activeLink) activeLink.classList.add('active');
    };

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const hash = e.currentTarget.getAttribute('href');
            window.location.hash = hash;
            showTab(hash);
        });
    });

    // --- FUNÇÕES DE RENDERIZAÇÃO E MANIPULAÇÃO DE DADOS ---
    const formatCurrency = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

    const loadAllDashboardData = async () => {
        const data = await apiFetch('/admin/dashboard-data');
        if (!data) return;
        Object.assign(state, data);
        renderDashboard();
        renderDosages();
        renderInventoryAndCosts();
        renderSettings();
        renderSalesHistory(); // Carrega histórico inicial
    };

    const renderDashboard = () => {
        document.getElementById('gross-revenue').textContent = formatCurrency(state.financials.gross_revenue);
        document.getElementById('total-costs').textContent = formatCurrency(state.financials.total_costs);
        const netProfitEl = document.getElementById('net-profit');
        netProfitEl.textContent = formatCurrency(state.financials.net_profit);
        netProfitEl.className = `text-3xl font-bold mt-2 ${state.financials.net_profit >= 0 ? 'text-green-600' : 'text-red-500'}`;
        
        const waterPercentage = (state.inventory.current_water_ml / state.settings.max_water_ml) * 100;
        document.getElementById('water-progress').style.width = `${waterPercentage}%`;
        document.getElementById('water-status').textContent = `${state.inventory.current_water_ml}ml / ${state.settings.max_water_ml}ml`;

        const coffeePercentage = (state.inventory.current_coffee_grams / state.settings.max_coffee_grams) * 100;
        document.getElementById('coffee-progress').style.width = `${coffeePercentage}%`;
        document.getElementById('coffee-status').textContent = `${state.inventory.current_coffee_grams}g / ${state.settings.max_coffee_grams}g`;
    };

    const renderDosages = () => {
        const list = document.getElementById('dosages-list');
        list.innerHTML = state.dosages.map(d => `
            <div class="grid grid-cols-4 gap-4 items-center border p-2 rounded-lg">
                <input type="text" value="${d.name}" data-id="${d.id}" data-field="name" class="input-field col-span-2" placeholder="Nome">
                <input type="number" value="${d.ml}" data-id="${d.id}" data-field="ml" class="input-field" placeholder="ml">
                <input type="number" step="0.01" value="${d.price}" data-id="${d.id}" data-field="price" class="input-field" placeholder="Preço">
            </div>
        `).join('');
    };
    document.getElementById('dosages-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const updatedDosages = state.dosages.map(d => {
            const name = document.querySelector(`input[data-id='${d.id}'][data-field='name']`).value;
            const ml = Number(document.querySelector(`input[data-id='${d.id}'][data-field='ml']`).value);
            const price = Number(document.querySelector(`input[data-id='${d.id}'][data-field='price']`).value);
            const time_s = Math.round(ml / 6) || 1; // Recalcula o tempo
            return { id: d.id, name, ml, price, time_s };
        });
        const result = await apiFetch('/admin/dosages', { method: 'PUT', body: JSON.stringify(updatedDosages) });
        if (result) {
            alert(result.message);
            loadAllDashboardData();
        }
    });

    const renderInventoryAndCosts = () => {
        const list = document.getElementById('costs-list');
        list.innerHTML = state.costs.map(c => `
            <li class="flex justify-between items-center border-b pb-1">
                <span>${c.description} - ${formatCurrency(c.value)}</span>
                <button data-id="${c.id}" class="delete-cost-btn text-red-500 hover:text-red-700">X</button>
            </li>
        `).join('');
        document.querySelectorAll('.delete-cost-btn').forEach(btn => btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm('Tem certeza que deseja deletar este custo?')) {
                await apiFetch(`/admin/costs/${id}`, { method: 'DELETE' });
                loadAllDashboardData();
            }
        }));
    };
    document.getElementById('refill-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const water_ml = document.getElementById('refill-water').value;
        const coffee_grams = document.getElementById('refill-coffee').value;
        const result = await apiFetch('/admin/refill', { method: 'POST', body: JSON.stringify({ water_ml, coffee_grams }) });
        if (result) {
            alert(result.message);
            e.target.reset();
            loadAllDashboardData();
        }
    });
    document.getElementById('costs-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const description = document.getElementById('cost-desc').value;
        const value = document.getElementById('cost-value').value;
        const purchase_date = document.getElementById('cost-date').value;
        const result = await apiFetch('/admin/costs', { method: 'POST', body: JSON.stringify({ description, value, purchase_date }) });
        if (result) {
            alert(result.message);
            e.target.reset();
            loadAllDashboardData();
        }
    });

    const renderSettings = () => {
        document.getElementById('max-water').value = state.settings.max_water_ml;
        document.getElementById('max-coffee').value = state.settings.max_coffee_grams;
        document.getElementById('grams-per-ml').value = state.settings.grams_per_ml;
        document.getElementById('banner-url').value = state.settings.banner_url;
    };
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const settingsData = {
            max_water_ml: document.getElementById('max-water').value,
            max_coffee_grams: document.getElementById('max-coffee').value,
            grams_per_ml: document.getElementById('grams-per-ml').value,
            banner_url: document.getElementById('banner-url').value,
        };
        const result = await apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify(settingsData) });
        if (result) {
            alert(result.message);
            loadAllDashboardData();
        }
    });

    const renderSalesHistory = async (startDate, endDate) => {
        let url = '/admin/sales-history';
        if (startDate && endDate) {
            url += `?start_date=${startDate}&end_date=${endDate}`;
        }
        const sales = await apiFetch(url);
        if (sales) {
            const body = document.getElementById('sales-table-body');
            body.innerHTML = sales.map(s => `
                <tr class="border-b">
                    <td class="p-2">${new Date(s.timestamp).toLocaleString('pt-BR')}</td>
                    <td class="p-2">${s.dosage_name}</td>
                    <td class="p-2">${formatCurrency(s.price)}</td>
                </tr>
            `).join('');
        }
    };
    document.getElementById('sales-filter-btn').addEventListener('click', () => {
        const startDate = document.getElementById('sales-start-date').value;
        const endDate = document.getElementById('sales-end-date').value;
        renderSalesHistory(startDate, endDate);
    });

    // --- INICIALIZAÇÃO ---
    if (localStorage.getItem('authToken')) {
        views.login.classList.add('hidden');
        views.panel.classList.remove('hidden');
        showTab(window.location.hash);
        loadAllDashboardData();
    } else {
        views.panel.classList.add('hidden');
        views.login.classList.remove('hidden');
    }
});

