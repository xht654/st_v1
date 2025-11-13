#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔧 Configuração Inicial do Stream Capture Multi-Sessão');

// Gerar chave de criptografia
const encryptionKey = crypto.randomBytes(32).toString('base64');
console.log('\n🔐 Chave de criptografia gerada:');
console.log(`ENCRYPTION_KEY=${encryptionKey}`);

// Criar diretórios necessários
const dirs = [
    '../logs',
    '../tvheadend/config',
    '../tvheadend/recordings', 
    '../tvheadend/timeshift',
    '../vpn',
    '../nginx/ssl'
];

console.log('\n📁 Criando diretórios...');
dirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`✅ ${dir}`);
    } else {
        console.log(`⚠️ ${dir} (já existe)`);
    }
});

// Verificar config.json
const configPath = path.join(__dirname, '../config.json');
if (!fs.existsSync(configPath)) {
    console.log('\n❌ Arquivo config.json não encontrado!');
    console.log('📋 Copie o arquivo de configuração de exemplo.');
} else {
    console.log('\n✅ Arquivo config.json encontrado');
}

// Verificar .env
const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
    console.log('\n📝 Criando arquivo .env...');
    const envContent = `# Stream Capture Multi-Sessão
NODE_ENV=production
TZ=Europe/Lisbon
DEBUG=false
ENCRYPTION_KEY=${encryptionKey}

# TVHeadend
TVHEADEND_HOST=tvheadend
TVHEADEND_PORT=9982
TVHEADEND_USER=admin
TVHEADEND_PASS=admin

# VPN (PureVPN)
VPN_ENABLED=false
VPN_PROVIDER=purevpn
VPN_USERNAME=
VPN_PASSWORD=
VPN_SERVER=us1-ovpn.purevpn.net
VPN_PORT=1194

# Portas
WEB_UI_PORT=3001
API_PORT=3000
STREAM_HTTP_PORT=8080
`;
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Arquivo .env criado');
} else {
    console.log('\n⚠️ Arquivo .env já existe');
}

console.log('\n🎉 Configuração inicial concluída!');
console.log('\n📋 Próximos passos:');
console.log('1. Edite o arquivo .env com suas configurações');
console.log('2. Configure os sites no config.json');
console.log('3. Execute: docker-compose up -d');
console.log('4. Acesse: http://localhost:3001');

