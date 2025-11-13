# Configuração VPN

## PureVPN

1. Copie `purevpn.ovpn.example` para `purevpn.ovpn`
2. Copie `auth.txt.example` para `auth.txt`
3. Edite `auth.txt` com suas credenciais PureVPN
4. Configure no sistema via Web UI

## OpenVPN Personalizado

1. Coloque seu arquivo `.ovpn` em `/app/vpn/custom.ovpn`
2. Se necessário, crie arquivo de autenticação em `/app/vpn/auth.txt`
3. Configure no sistema selecionando "OpenVPN Personalizado"

## Segurança

- Todos os arquivos de configuração VPN são ignorados pelo Git
- Senhas são criptografadas antes de serem salvas
- Certificados devem ter permissões 600

## Servidores PureVPN Recomendados

- US1: us1-ovpn.purevpn.net (Estados Unidos)
- UK1: uk1-ovpn.purevpn.net (Reino Unido)
- DE1: de1-ovpn.purevpn.net (Alemanha)

