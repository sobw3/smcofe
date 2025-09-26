document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'https://smcofe.onrender.com';

    const views = {
        main: document.getElementById('main-view'),
        pix: document.getElementById('pix-payment-view'),
        status: document.getElementById('status-view'),
    };
    const menuModal = document.getElementById('menu-modal');
    const loadingDosages = document.getElementById('loading-dosages');
    const dosagesContainer = document.getElementById('dosages-container');
    const errorContainer = document.getElementById('error-container');
    const errorMessageEl = document.getElementById('error-message');
    const bannerImage = document.getElementById('banner-image');
    
    const pixQrContainer = document.getElementById('pix-qr-code-container');
    const pixAmountEl = document.getElementById('pix-amount');
    const pixCodeInput = document.getElementById('pix-code-input');

    let currentDosage = null;
    let paymentPollingInterval = null;
    let isNavigating = false; // Trava para a navegação

    // --- LÓGICA DE NAVEGAÇÃO ROBUSTA ---
    function navigateTo(viewName) {
        if (isNavigating) return; // Impede cliques múltiplos
        isNavigating = true;

        const currentActive = document.querySelector('.view.active');
        const nextView = views[viewName];

        if (!nextView || currentActive === nextView) {
            isNavigating = false; // Libera a trava se a navegação for inválida
            return;
        }

        // Aplica as classes para iniciar as animações
        if (currentActive) {
            currentActive.classList.add('exiting');
        }
        nextView.classList.add('active');

        // Após a animação, limpa a tela antiga e libera a trava
        setTimeout(() => {
            if (currentActive) {
                // A classe 'active' precisa ser removida para que a tela 'saia' do fluxo
                // e possa ser re-animada corretamente no futuro.
                currentActive.classList.remove('active', 'exiting');
            }
            isNavigating = false; // Libera para nova navegação
        }, 500); // Deve ser a mesma duração da transição CSS
    }

    function savePaymentSession(sessionData) { localStorage.setItem('smartCoffeeSession', JSON.stringify(sessionData)); }
    function getPaymentSession() { const s = localStorage.getItem('smartCoffeeSession'); return s ? JSON.parse(s) : null; }
    function clearPaymentSession() { localStorage.removeItem('smartCoffeeSession'); }

    async function restoreSession() {
        const session = getPaymentSession();
        if (!session) return;

        console.log("Restaurando sessão de pagamento...", session);
        currentDosage = session.dosage;
        pixAmountEl.textContent = `R$ ${session.dosage.price.toFixed(2).replace('.', ',')}`;
        pixQrContainer.innerHTML = `<img class="w-full h-full object-contain" src="data:image/jpeg;base64,${session.pix.qr_code_base64}" alt="QR Code PIX" />`;
        pixCodeInput.value = session.pix.qr_code;
        startPaymentPolling(session.paymentId);
        navigateTo('pix');
    }

    async function initializeApp() {
        try {
            const response = await fetch(`${API_URL}/client-data`);
            if (!response.ok) throw new Error(`Servidor respondeu com status ${response.status}`);
            const data = await response.json();

            bannerImage.src = data.bannerUrl;
            loadingDosages.classList.add('hidden');
            dosagesContainer.innerHTML = '';
            data.dosages.forEach((dose, index) => {
                const card = document.createElement('button');
                card.className = 'w-full flex justify-between items-center p-4 dosage-card text-left';
                card.style.animationDelay = `${index * 100}ms`;
                card.innerHTML = `<div><p class="text-lg font-semibold">${dose.name}</p><p class="text-sm" style="color: var(--secondary-text);">${dose.ml}ml</p></div><span class="text-lg font-bold" style="color: var(--accent-color);">R$ ${dose.price.toFixed(2).replace('.',',')}</span>`;
                card.addEventListener('click', () => handleDosageSelection(dose));
                dosagesContainer.appendChild(card);
            });
        } catch (error) {
            console.error("Falha ao inicializar:", error);
            loadingDosages.classList.add('hidden');
            errorContainer.classList.remove('hidden');
            errorMessageEl.textContent = "Falha ao conectar com o servidor. Verifique se ele está rodando e recarregue a página.";
        }
    }

    async function handleDosageSelection(dose) {
        currentDosage = dose;
        try {
            const response = await fetch(`${API_URL}/create-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dosageId: dose.id })
            });

            const paymentData = await response.json();
            if (!response.ok) throw new Error(paymentData.error || 'Erro desconhecido do servidor.');

            if (!paymentData.paymentId || !paymentData.pix || !paymentData.pix.qr_code) {
                 throw new Error('Dados de pagamento PIX inválidos recebidos do servidor.');
            }

            savePaymentSession({
                paymentId: paymentData.paymentId,
                dosage: currentDosage,
                pix: paymentData.pix
            });
            
            pixAmountEl.textContent = `R$ ${currentDosage.price.toFixed(2).replace('.', ',')}`;
            pixQrContainer.innerHTML = `<img class="w-full h-full object-contain" src="data:image/jpeg;base64,${paymentData.pix.qr_code_base64}" alt="QR Code PIX" />`;
            pixCodeInput.value = paymentData.pix.qr_code;
            startPaymentPolling(paymentData.paymentId);
            navigateTo('pix');

        } catch (error) {
            console.error("Erro ao iniciar pagamento:", error);
            alert(`Não foi possível iniciar o pagamento: ${error.message}`);
        }
    }
    
    function startPaymentPolling(paymentId) {
        if (paymentPollingInterval) clearInterval(paymentPollingInterval);
        paymentPollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_URL}/payment-status/${paymentId}`);
                const data = await response.json();
                if (data.status === 'approved') {
                    clearInterval(paymentPollingInterval);
                    clearPaymentSession();
                    runStatusSequence();
                }
            } catch (error) { console.error("Erro ao verificar status:", error); }
        }, 3000);
    }

    function stopPaymentPolling() {
        if (paymentPollingInterval) clearInterval(paymentPollingInterval);
        paymentPollingInterval = null;
    }

    function runStatusSequence() {
        navigateTo('status');
        const screens = [
            document.getElementById('payment-confirmed'),
            document.getElementById('attention-warning'),
            document.getElementById('filling-cup'),
            document.getElementById('enjoy-coffee')
        ];
        let currentScreen = 0;

        const nextScreen = () => {
            if (currentScreen > 0) screens[currentScreen - 1].classList.add('exiting');
            if (currentScreen < screens.length) {
                screens[currentScreen].classList.add('active');
                const duration = (currentScreen === 2) ? (currentDosage.time_s * 1000) : 4000;
                setTimeout(nextScreen, duration);
                currentScreen++;
            } else {
                setTimeout(() => {
                    screens.forEach(s => s.classList.remove('active', 'exiting'));
                    navigateTo('main');
                }, 1000);
            }
        };
        nextScreen();
    }

    document.getElementById('menu-btn').addEventListener('click', () => menuModal.classList.remove('hidden'));
    document.getElementById('close-menu-btn').addEventListener('click', () => menuModal.classList.add('hidden'));
    
    document.getElementById('copy-pix-btn').addEventListener('click', (e) => {
        const button = e.currentTarget;
        navigator.clipboard.writeText(pixCodeInput.value).then(() => {
            const originalText = button.textContent;
            button.textContent = 'Copiado!';
            setTimeout(() => { button.textContent = originalText; }, 2000);
        });
    });

    document.getElementById('cancel-pix-btn').addEventListener('click', () => {
        stopPaymentPolling();
        clearPaymentSession();
        navigateTo('main');
    });
    
    initializeApp();
    restoreSession();
});

