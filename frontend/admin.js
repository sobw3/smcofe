console.log("Admin App - Versão Deploy 2.0 - Carregado com sucesso!");

document.addEventListener('DOMContentLoaded', () => {
    // ############ ATENÇÃO: URL DA SUA API NO RENDER ############
    const API_URL = 'https://smcofe.onrender.com';
    // #########################################################

    // Elementos da UI
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password-input');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const navLinks = document.querySelectorAll('.nav-link');
    const tabContent = document.getElementById('tab-content');

    // Função genérica para chamadas de API
    async function apiFetch(endpoint, method = 'GET', body = null) {
        const token = localStorage.getItem('authToken');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            method,
            headers,
            body: body ? JSON.stringify(body) : null,
        };

        console.log(`[DIAGNÓSTICO ADMIN] Chamando API: ${method} ${API_URL}${endpoint}`);
        const response = await fetch(`${API_URL}${endpoint}`, config);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Erro de comunicação com o servidor.' }));
            console.error(`[ERRO ADMIN] API retornou status ${response.status}`, errorData);
            throw new Error(errorData.error || `Erro ${response.status}`);
        }

        return response.json();
    }

    // --- LÓGICA DE LOGIN/LOGOUT ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = passwordInput.value;
        loginError.classList.add('hidden');

        try {
            // ##### CORREÇÃO APLICADA AQUI: Endpoint é '/login' #####
            const data = await apiFetch('/login', 'POST', { password });
            if (data.token) {
                localStorage.setItem('authToken', data.token);
                showDashboard();
            }
        } catch (error) {
            loginError.textContent = `Erro no login: ${error.message}`;
            loginError.classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        showLogin();
    });

    // --- CONTROLE DE VISIBILIDADE ---
    function showDashboard() {
        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        loadDashboardData();
    }

    function showLogin() {
        loginView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
    }

    // --- CARREGAMENTO DE DADOS E RENDERIZAÇÃO ---
    async function loadDashboardData() {
        try {
            const data = await apiFetch('/admin/dashboard');
            renderDashboard(data);
            setupEventListeners(data);
        } catch (error) {
            tabContent.innerHTML = `<div class="card p-4 text-red-600">Falha ao carregar dados do dashboard: ${error.message}</div>`;
        }
    }

    // --- NAVEGAÇÃO POR ABAS ---
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            // Recarrega os dados para garantir que a aba correta seja renderizada
            loadDashboardData();
        });
    });
    
    // --- FUNÇÕES DE RENDERIZAÇÃO (abreviadas, a lógica principal está no setupEventListeners) ---
    function renderDashboard(data) {
        const activeTab = document.querySelector('.nav-link.active').dataset.tab;
        switch (activeTab) {
            case 'dashboard':
                renderFinancialDashboard(data);
                break;
            case 'dosages':
                renderDosages(data);
                break;
            case 'inventory':
                renderInventoryAndCosts(data);
                break;
            case 'config':
                renderConfig(data);
                break;
            case 'sales':
                renderSales(data);
                break;
        }
    }
    
    // As funções render* e setupEventListeners* estariam aqui (são longas e não precisam de alteração)
    // Para manter o foco na correção, a lógica completa de renderização foi omitida,
    // mas ela funcionará corretamente com a chamada `loadDashboardData` já existente.
    // Apenas para exemplo, uma das funções de renderização:
    function renderFinancialDashboard(data) {
        // Exemplo: calcula o faturamento total
        const totalSales = data.sales.filter(s => s.status === 'approved').reduce((sum, sale) => sum + parseFloat(sale.price), 0);
        const totalCosts = data.costs.reduce((sum, cost) => sum + parseFloat(cost.value), 0);
        const netProfit = totalSales - totalCosts;

        tabContent.innerHTML = `
            <div class="card p-6">
                <h2 class="text-2xl font-bold mb-4">Visão Geral Financeira</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div class="p-4 bg-green-50 rounded-lg">
                        <p class="text-sm text-green-700 font-semibold">Faturamento Bruto</p>
                        <p class="text-3xl font-bold text-green-800">R$ ${totalSales.toFixed(2).replace('.', ',')}</p>
                    </div>
                     <div class="p-4 bg-red-50 rounded-lg">
                        <p class="text-sm text-red-700 font-semibold">Custos Totais</p>
                        <p class="text-3xl font-bold text-red-800">R$ ${totalCosts.toFixed(2).replace('.', ',')}</p>
                    </div>
                     <div class="p-4 rounded-lg ${netProfit >= 0 ? 'bg-blue-50' : 'bg-orange-50'}">
                        <p class="text-sm font-semibold ${netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}">Lucro Líquido</p>
                        <p class="text-3xl font-bold ${netProfit >= 0 ? 'text-blue-800' : 'text-orange-800'}">R$ ${netProfit.toFixed(2).replace('.', ',')}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Funções de renderização completas (essenciais para o funcionamento)
    // ... (O restante do código que gera as outras abas)
    // Esta parte é complexa, vou adicionar o código completo que já foi gerado antes.

    function setupEventListeners(data) {
        const activeTab = document.querySelector('.nav-link.active').dataset.tab;
        if (activeTab === 'dosages') {
            document.getElementById('save-dosages-btn').addEventListener('click', handleSaveDosages);
        }
        if (activeTab === 'inventory') {
            document.getElementById('save-inventory-btn').addEventListener('click', handleSaveInventory);
            document.getElementById('add-cost-btn').addEventListener('click', handleAddCost);
            document.getElementById('clear-costs-btn').addEventListener('click', handleClearCosts);
        }
        if (activeTab === 'config') {
            document.getElementById('save-config-btn').addEventListener('click', handleSaveConfig);
        }
    }

    function renderDosages(data) {
        let dosagesHtml = data.dosages.map(d => `
            <div class="grid grid-cols-6 gap-3 items-center" data-dosage-id="${d.id}">
                <input type="text" value="${d.name}" class="input-field col-span-2" data-field="name">
                <input type="number" value="${d.ml}" class="input-field" data-field="ml">
                <input type="number" step="0.01" value="${parseFloat(d.price).toFixed(2)}" class="input-field" data-field="price">
                <input type="number" value="${d.time_s}" class="input-field" data-field="time_s">
                <div class="flex items-center justify-center">
                    <input type="checkbox" ${d.active ? 'checked' : ''} class="h-5 w-5" data-field="active">
                    <label class="ml-2">Ativa</label>
                </div>
            </div>
        `).join('');

        tabContent.innerHTML = `
            <div class="card p-6">
                <h2 class="text-2xl font-bold mb-4">Gerenciar Dosagens</h2>
                <div class="space-y-4">
                    <div class="grid grid-cols-6 gap-3 text-sm font-semibold text-gray-600 px-2">
                        <span class="col-span-2">Nome</span>
                        <span>ML</span>
                        <span>Preço (R$)</span>
                        <span>Tempo (s)</span>
                        <span class="text-center">Status</span>
                    </div>
                    ${dosagesHtml}
                </div>
                <div class="mt-6 text-right">
                    <button id="save-dosages-btn" class="btn-primary">Salvar Alterações</button>
                </div>
            </div>
        `;
    }

    function renderInventoryAndCosts(data) {
        const costsHtml = data.costs.map(c => `
            <li class="flex justify-between items-center py-2 border-b">
                <span>${c.name}</span>
                <span class="font-semibold">R$ ${parseFloat(c.value).toFixed(2).replace('.',',')}</span>
            </li>
        `).join('');

        tabContent.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="card p-6">
                    <h2 class="text-2xl font-bold mb-4">Abastecer Estoque</h2>
                    <form id="inventory-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Café (gramas)</label>
                            <input type="number" id="coffee-grams" value="${data.inventory.coffee_grams}" class="input-field w-full">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Água (ml)</label>
                            <input type="number" id="water-ml" value="${data.inventory.water_ml}" class="input-field w-full">
                        </div>
                        <div class="text-right">
                            <button type="button" id="save-inventory-btn" class="btn-primary">Salvar Estoque</button>
                        </div>
                    </form>
                </div>
                <div class="card p-6">
                    <h2 class="text-2xl font-bold mb-4">Registrar Custos</h2>
                    <form id="cost-form" class="flex gap-2 mb-4">
                        <input type="text" id="cost-name" placeholder="Nome do custo (ex: Pacote de café)" class="input-field flex-grow">
                        <input type="number" step="0.01" id="cost-value" placeholder="Valor" class="input-field w-24">
                        <button type="button" id="add-cost-btn" class="btn-primary">Adicionar</button>
                    </form>
                    <h3 class="font-semibold mt-6 mb-2">Custos Registrados</h3>
                    <ul id="costs-list">${costsHtml}</ul>
                    <div class="mt-4 text-right">
                        <button id="clear-costs-btn" class="text-sm text-red-600 hover:underline">Zerar Custos</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderConfig(data) {
        const configMap = new Map(data.config.map(item => [item.key, item.value]));
        tabContent.innerHTML = `
            <div class="card p-6 max-w-lg mx-auto">
                <h2 class="text-2xl font-bold mb-4">Configurações da Máquina</h2>
                <form id="config-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">URL do Banner</label>
                        <input type="text" id="banner-url" value="${configMap.get('banner_url') || ''}" class="input-field w-full">
                    </div>
                     <div>
                        <label class="block text-sm font-medium mb-1">Capacidade de Água (ml)</label>
                        <input type="number" id="water-capacity" value="${configMap.get('machine_water_capacity_ml') || ''}" class="input-field w-full">
                    </div>
                     <div>
                        <label class="block text-sm font-medium mb-1">Capacidade de Café (g)</label>
                        <input type="number" id="coffee-capacity" value="${configMap.get('machine_coffee_capacity_g') || ''}" class="input-field w-full">
                    </div>
                    <div class="text-right">
                        <button type="button" id="save-config-btn" class="btn-primary">Salvar Configurações</button>
                    </div>
                </form>
            </div>
        `;
    }

    function renderSales(data) {
        const salesHtml = data.sales.map(s => `
            <tr class="border-b">
                <td class="p-3">${new Date(s.created_at).toLocaleString('pt-BR')}</td>
                <td class="p-3">${s.dosage_name}</td>
                <td class="p-3">R$ ${parseFloat(s.price).toFixed(2).replace('.',',')}</td>
                <td class="p-3">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${s.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${s.status === 'approved' ? 'Aprovado' : 'Pendente'}
                    </span>
                </td>
            </tr>
        `).join('');

        tabContent.innerHTML = `
            <div class="card p-6">
                <h2 class="text-2xl font-bold mb-4">Histórico de Vendas</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="p-3 font-semibold">Data</th>
                                <th class="p-3 font-semibold">Produto</th>
                                <th class="p-3 font-semibold">Valor</th>
                                <th class="p-3 font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody>${salesHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    // --- FUNÇÕES DE MANIPULAÇÃO (HANDLERS) ---
    async function handleSaveDosages() {
        const dosageRows = document.querySelectorAll('[data-dosage-id]');
        const dosages = Array.from(dosageRows).map(row => ({
            id: row.dataset.dosageId,
            name: row.querySelector('[data-field="name"]').value,
            ml: parseInt(row.querySelector('[data-field="ml"]').value),
            price: parseFloat(row.querySelector('[data-field="price"]').value),
            time_s: parseInt(row.querySelector('[data-field="time_s"]').value),
            active: row.querySelector('[data-field="active"]').checked
        }));
        
        try {
            await apiFetch('/admin/dosages', 'POST', { dosages });
            alert('Dosagens salvas com sucesso!');
            loadDashboardData();
        } catch (error) {
            alert(`Erro ao salvar dosagens: ${error.message}`);
        }
    }
    
    async function handleSaveInventory() {
       const body = {
            coffee_grams: parseFloat(document.getElementById('coffee-grams').value),
            water_ml: parseInt(document.getElementById('water-ml').value),
       };
        try {
            await apiFetch('/admin/inventory', 'POST', body);
            alert('Estoque salvo com sucesso!');
            loadDashboardData();
        } catch (error) {
            alert(`Erro ao salvar estoque: ${error.message}`);
        }
    }

    async function handleAddCost() {
        const name = document.getElementById('cost-name').value;
        const value = parseFloat(document.getElementById('cost-value').value);
        if (!name || !value) return alert('Preencha o nome e o valor do custo.');

        try {
            await apiFetch('/admin/costs', 'POST', { name, value });
            loadDashboardData();
        } catch (error) {
            alert(`Erro ao adicionar custo: ${error.message}`);
        }
    }
    
    async function handleClearCosts() {
        if (!confirm('Tem certeza que deseja zerar todos os custos registrados? Esta ação não pode ser desfeita.')) return;
        try {
            await apiFetch('/admin/costs/clear', 'POST');
            loadDashboardData();
        } catch (error) {
            alert(`Erro ao zerar custos: ${error.message}`);
        }
    }
    
     async function handleSaveConfig() {
        const body = {
            bannerUrl: document.getElementById('banner-url').value,
            waterCapacity: parseInt(document.getElementById('water-capacity').value),
            coffeeCapacity: parseInt(document.getElementById('coffee-capacity').value),
        };
        try {
            await apiFetch('/admin/config', 'POST', body);
            alert('Configurações salvas com sucesso!');
            loadDashboardData();
        } catch (error) {
            alert(`Erro ao salvar configurações: ${error.message}`);
        }
    }


    // --- INICIALIZAÇÃO ---
    if (localStorage.getItem('authToken')) {
        showDashboard();
    } else {
        showLogin();
    }
});

