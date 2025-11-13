#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testVPN() {
    console.log('🧪 Testando conectividade VPN...\n');
    
    try {
        // Obter IP atual
        console.log('📍 IP atual:');
        const { stdout: currentIP } = await execAsync('curl -s https://api.ipify.org');
        console.log(`   ${currentIP.trim()}\n`);
        
        // Verificar se OpenVPN está instalado
        try {
            await execAsync('which openvpn');
            console.log('✅ OpenVPN está instalado');
        } catch {
            console.log('❌ OpenVPN não encontrado');
            return;
        }
        
        // Verificar dispositivo TUN
        try {
            await execAsync('ls /dev/net/tun');
            console.log('✅ Dispositivo TUN disponível');
        } catch {
            console.log('❌ Dispositivo TUN não encontrado');
        }
        
        // Verificar arquivos de configuração VPN
        const vpnFiles = [
            '/app/vpn/purevpn.ovpn',
            '/app/vpn/auth.txt',
            '/tmp/purevpn.ovpn'
        ];
        
        console.log('\n📁 Arquivos de configuração VPN:');
        for (const file of vpnFiles) {
            try {
                await execAsync(`ls ${file}`);
                console.log(`✅ ${file}`);
            } catch {
                console.log(`❌ ${file} (não encontrado)`);
            }
        }
        
        // Testar conectividade DNS
        console.log('\n🌐 Testando DNS:');
        try {
            await execAsync('nslookup google.com');
            console.log('✅ Resolução DNS funcionando');
        } catch {
            console.log('❌ Problema na resolução DNS');
        }
        
        console.log('\n✅ Teste de VPN concluído');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error.message);
    }
}

testVPN();

