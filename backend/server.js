const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg'); // Importa o conector do PostgreSQL
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // O Render usa a variável de ambiente PORT
const JWT_SECRET = process.env.JWT_SECRET || 'seu_jwt_secret_super_secreto_e_longo_para_seguranca';

console.log('[DIAGNÓSTICO] Iniciando o servidor...');

// --- Configuração do Banco de Dados PostgreSQL ---
// O Render irá fornecer a string de conexão através da variável de ambiente DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necessário para conexões no Render
    }
});

// Função para criar as tabelas se não existirem
async function initializeDatabase() {
    console.log("[DIAGNÓSTICO] Verificando e inicializando o banco de dados PostgreSQL...");
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS config (key VARCHAR(255) PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS dosages (id SERIAL PRIMARY KEY, name VARCHAR(255), ml INTEGER, price NUMERIC(10, 2), time_s INTEGER, active BOOLEAN DEFAULT TRUE);
            CREATE TABLE IF NOT EXISTS inventory (id SERIAL PRIMARY KEY, coffee_grams NUMERIC(10, 2), water_ml NUMERIC(10, 2));
            CREATE TABLE IF NOT EXISTS costs (id SERIAL PRIMARY KEY, name VARCHAR(255), value NUMERIC(10, 2), created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS sales (id SERIAL PRIMARY KEY, dosage_id INTEGER, dosage_name VARCHAR(255), price NUMERIC(10, 2), status VARCHAR(50), created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, external_reference VARCHAR(255), payment_id BIGINT);
        `);

        // Popula as tabelas se estiverem vazias
        const dosagesCount = await pool.query("SELECT COUNT(*) FROM dosages");
        if (dosagesCount.rows[0].count === '0') {
            await pool.query(`INSERT INTO dosages (id, name, ml, price, time_s, active) VALUES (1, 'Expresso Clássico', 30, 4.50, 5, TRUE), (2, 'Duplo', 50, 6.00, 8, TRUE), (3, 'Lungo', 75, 7.50, 11, TRUE)`);
        }
        const configCount = await pool.query("SELECT COUNT(*) FROM config");
        if (configCount.rows[0].count === '0') {
            await pool.query(`INSERT INTO config (key, value) VALUES ('banner_url', 'https://images.unsplash.com/photo-1511920183273-3c9c41b8a5b7?q=80&w=1887&auto=format&fit=crop'), ('machine_water_capacity_ml', '1800'), ('machine_coffee_capacity_g', '250')`);
        }
        const inventoryCount = await pool.query("SELECT COUNT(*) FROM inventory");
        if (inventoryCount.rows[0].count === '0') {
            await pool.query("INSERT INTO inventory (id, coffee_grams, water_ml) VALUES (1, 250, 1800)");
        }
        console.log("[DIAGNÓSTICO] Banco de dados PostgreSQL pronto.");
    } catch (err) {
        console.error("[ERRO CRÍTICO] Falha ao inicializar o banco de dados:", err);
    }
}

// --- Configuração do Mercado Pago ---
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || "APP_USR-3008476403980875-092600-faec9bac81acdd56cabd2b0e304d31cf-250701524"; // Use variáveis de ambiente!
const client = new MercadoPagoConfig({ accessToken: MERCADOPAGO_ACCESS_TOKEN, options: { timeout: 5000 } });
const payment = new Payment(client);

// --- Middlewares ---
app.use(cors());
app.use(bodyParser.json());

// --- Servindo Arquivos Estáticos ---
const frontendPath = path.join(__dirname, '../frontend');
console.log(`[DIAGNÓSTICO] Servindo arquivos estáticos do diretório: ${frontendPath}`);
app.use(express.static(frontendPath));

app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

// --- ROTAS DA API ---

// Rota de Login Admin
app.post('/login', (req, res) => {
    if (req.body.password === (process.env.ADMIN_PASSWORD || 'admin_super_secreto')) {
        const token = jwt.sign({ user: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Senha inválida.' });
    }
});

// Middleware de Autenticação
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        jwt.verify(authHeader.split(' ')[1], JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// Obter dados do cliente
app.get('/client-data', async (req, res) => {
    try {
        const dosagesResult = await pool.query("SELECT id, name, ml, price, time_s FROM dosages WHERE active = TRUE ORDER BY id");
        const bannerResult = await pool.query("SELECT value FROM config WHERE key = 'banner_url'");
        res.json({
            dosages: dosagesResult.rows,
            bannerUrl: bannerResult.rows.length > 0 ? bannerResult.rows[0].value : ''
        });
    } catch (error) {
        console.error("[ERRO] Erro ao buscar dados do cliente:", error);
        res.status(500).json({ error: 'Falha ao carregar dados da máquina.' });
    }
});

// Rota de Pagamento
app.post('/create-payment', async (req, res) => {
    const { dosageId } = req.body;
    try {
        const dosageResult = await pool.query("SELECT * FROM dosages WHERE id = $1", [dosageId]);
        const dosage = dosageResult.rows[0];
        if (!dosage) return res.status(404).json({ error: "Dosagem não encontrada." });

        const idempotencyKey = uuidv4();
        const externalReference = `smartcoffee-sale-${Date.now()}`;

        const paymentRequestBody = {
            transaction_amount: parseFloat(dosage.price),
            description: dosage.name,
            payment_method_id: 'pix',
            payer: {
                email: `visitante_${Date.now()}@smartcoffee.com`,
                first_name: 'Visitante',
                last_name: 'SmartCoffee',
                identification: { type: 'CPF', number: '99999999999' }
            },
            external_reference: externalReference
        };

        const result = await payment.create({ body: paymentRequestBody, requestOptions: { idempotencyKey } });
        const pixData = result.point_of_interaction?.transaction_data;
        if (!pixData) {
            return res.status(500).json({ error: 'Falha na comunicação com o MP. Não foram recebidos os dados do PIX.' });
        }
        
        await pool.query("INSERT INTO sales (dosage_id, dosage_name, price, status, external_reference, payment_id) VALUES ($1, $2, $3, 'pending', $4, $5)", [dosage.id, dosage.name, dosage.price, externalReference, result.id]);

        res.json({ paymentId: result.id, pix: pixData });

    } catch (error) {
        console.error('[ERRO] Erro crítico ao criar pagamento:', error?.cause ?? error);
        const errorMessage = error?.cause?.error?.message || 'Falha ao criar pagamento no Mercado Pago.';
        res.status(500).json({ error: errorMessage });
    }
});

// Verificar status do pagamento
app.get('/payment-status/:id', async (req, res) => {
     try {
        const result = await pool.query("SELECT status FROM sales WHERE payment_id = $1", [req.params.id]);
        res.json({ status: result.rows.length > 0 ? result.rows[0].status : 'pending' });
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        res.status(500).json({ error: 'Falha ao buscar status.' });
    }
});

// Webhook para notificações
app.post('/payment-notification', async (req, res) => {
    if (req.query.topic === 'payment') {
        try {
            const paymentDetails = await payment.get({ id: req.query.id });
            if (paymentDetails.status === 'approved') {
                await pool.query("UPDATE sales SET status = 'approved' WHERE external_reference = $1", [paymentDetails.external_reference]);
                console.log(`[SUCESSO via Webhook] Venda ${paymentDetails.external_reference} aprovada.`);
            }
        } catch (error) {
            console.error('Erro no webhook:', error);
        }
    }
    res.sendStatus(200);
});

// --- ROTAS DO ADMIN ---
app.get('/admin/dashboard', authenticateJWT, async (req, res) => {
    try {
        const configRes = await pool.query("SELECT * FROM config");
        const dosagesRes = await pool.query("SELECT * FROM dosages ORDER BY id");
        const inventoryRes = await pool.query("SELECT * FROM inventory LIMIT 1");
        const costsRes = await pool.query("SELECT * FROM costs ORDER BY created_at DESC");
        const salesRes = await pool.query("SELECT * FROM sales ORDER BY created_at DESC");
        
        res.json({
            config: configRes.rows,
            dosages: dosagesRes.rows,
            inventory: inventoryRes.rows[0] || {},
            costs: costsRes.rows,
            sales: salesRes.rows,
        });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao carregar dados do admin.' });
    }
});

app.post('/admin/config', authenticateJWT, async (req, res) => {
    const { bannerUrl, waterCapacity, coffeeCapacity } = req.body;
    try {
        await pool.query("UPDATE config SET value = $1 WHERE key = 'banner_url'", [bannerUrl]);
        await pool.query("UPDATE config SET value = $1 WHERE key = 'machine_water_capacity_ml'", [waterCapacity]);
        await pool.query("UPDATE config SET value = $1 WHERE key = 'machine_coffee_capacity_g'", [coffeeCapacity]);
        res.json({ message: 'Configurações salvas!' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao salvar configurações.' });
    }
});

app.post('/admin/dosages', authenticateJWT, async (req, res) => {
    const { dosages } = req.body;
    try {
        for (const d of dosages) {
            await pool.query("UPDATE dosages SET name = $1, ml = $2, price = $3, time_s = $4, active = $5 WHERE id = $6", [d.name, d.ml, d.price, d.time_s, d.active, d.id]);
        }
        res.json({ message: 'Dosagens salvas!' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao salvar dosagens.' });
    }
});

app.post('/admin/inventory', authenticateJWT, async (req, res) => {
    const { water_ml, coffee_grams } = req.body;
    try {
        await pool.query("UPDATE inventory SET water_ml = $1, coffee_grams = $2 WHERE id = 1", [water_ml, coffee_grams]);
        res.json({ message: 'Inventário abastecido!' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao abastecer inventário.' });
    }
});

app.post('/admin/costs', authenticateJWT, async (req, res) => {
    const { name, value } = req.body;
    try {
        await pool.query("INSERT INTO costs (name, value) VALUES ($1, $2)", [name, value]);
        res.json({ message: 'Custo adicionado!' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao adicionar custo.' });
    }
});

app.post('/admin/costs/clear', authenticateJWT, async (req, res) => {
    try {
        await pool.query("DELETE FROM costs");
        res.json({ message: 'Custos zerados!' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao zerar custos.' });
    }
});

// Inicializa o banco de dados e depois inicia o servidor
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`[DIAGNÓSTICO] Servidor SmartCoffee rodando na porta ${PORT}`);
        console.log(`[DIAGNÓSTICO] Acesse em http://localhost:${PORT} (localmente) ou na sua URL do Render.`);
    });
});

