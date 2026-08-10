# Credenciais MQTT por dispositivo

Esta etapa troca o `passwordfile` e o `aclfile` estáticos do Mosquitto pelo
plugin **Dynamic Security**. Cada placa terá uma conta MQTT revogável:

- usuário: `device-<uuid-da-placa>`;
- client id obrigatório: `<uuid-da-placa>`;
- senha: a credencial de bootstrap, devolvida uma única vez pela API;
- autorização: apenas o namespace `netin/v1/devices/<uuid>/...`.

Ao remover uma placa pela PWA, a API a apaga no broker. A remoção desconecta uma
sessão ainda ativa usando aquela conta.

## Preparação

1. Faça a alteração em uma janela de manutenção: haverá um reinício do broker.
2. Preserve o volume `mosquitto-data`; o plugin gravará nele o estado de clientes,
   papéis e ACLs.
3. Gere duas senhas longas e diferentes: uma para `netin-dynsec-admin` e outra
   para `netin-server`. Não reutilize a senha que foi usada nos testes iniciais.
4. Descubra o caminho do plugin na imagem em execução:

   ```bash
   docker exec netin-mosquitto sh -c 'find / -name mosquitto_dynamic_security.so 2>/dev/null'
   ```

## Configurar o broker

1. Crie `secrets/mosquitto/dynsec-init-password` com a senha inicial do
   administrador `admin`. Este arquivo é local, não entra no Git.
2. Substitua a configuração de produção pelo modelo abaixo, ajustando a linha
   `plugin` com o caminho descoberto acima:

   ```conf
   persistence true
   persistence_location /mosquitto/data/
   log_dest stdout

   allow_anonymous false
   plugin /usr/lib/mosquitto_dynamic_security.so
   plugin_opt_config_file /mosquitto/data/dynamic-security.json
   plugin_opt_password_init_file /mosquitto/config/dynsec-init-password

   listener 1883
   listener 9001
   protocol websockets
   ```

3. No Compose do Mosquitto, remova os mounts de `passwordfile` e `aclfile` e
   acrescente:

   ```yaml
   - ./secrets/mosquitto/dynsec-init-password:/mosquitto/config/dynsec-init-password:ro
   ```

4. Reinicie o broker. Na primeira inicialização, Mosquitto 2.1 cria o usuário
   `admin` com a senha do arquivo de inicialização.
5. Crie os clientes internos. Os comandos pedem a senha de `admin`; não a passe
   pela linha de comando.

   ```bash
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec createClient netin-dynsec-admin -i netin-dynsec-admin
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addClientRole netin-dynsec-admin dynsec-admin 1

   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec createRole netin-server
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-server publishClientSend 'netin/v1/#' allow 1
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-server publishClientReceive 'netin/v1/#' allow 1
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-server subscribePattern 'netin/v1/#' allow 1
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-server unsubscribePattern 'netin/v1/#' allow 1
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec createClient netin-server -i netin-server
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addClientRole netin-server netin-server 1
   ```

6. Crie o papel das placas. Como o client id é o UUID, `%c` limita cada placa ao
   seu próprio prefixo de tópicos:

   ```bash
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec createRole netin-device
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-device publishClientSend 'netin/v1/devices/%c/events' allow 1
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-device publishClientSend 'netin/v1/devices/%c/ack' allow 1
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-device publishClientReceive 'netin/v1/devices/%c/commands' allow 1
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-device subscribePattern 'netin/v1/devices/%c/commands' allow 1
   docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec addRoleACL netin-device unsubscribePattern 'netin/v1/devices/%c/commands' allow 1
   ```

7. Remova `dynsec-init-password` e o mount correspondente: ele só é necessário
   para o primeiro boot. Preencha no `.env.production`:

   ```env
   MQTT_URL=mqtt://mosquitto:1883
   MQTT_USERNAME=netin-server
   MQTT_PASSWORD=<senha-do-netin-server>
   MQTT_CLIENT_ID=netin-server
   MQTT_ADMIN_USERNAME=netin-dynsec-admin
   MQTT_ADMIN_PASSWORD=<senha-do-administrador-dinamico>
   MQTT_ADMIN_CLIENT_ID=netin-dynsec-admin
   ```

8. Execute o deploy normal da API. Uma chamada futura a `POST /device/credential`
   cria ou rotaciona a conta MQTT daquela placa.

## Validar

```bash
docker exec -it netin-mosquitto mosquitto_ctrl -h localhost -p 1883 -u admin dynsec getClient device-<uuid>
```

Depois remova a placa pela PWA e confirme que o mesmo comando informa que o
cliente não existe mais.

O Dynamic Security mantém seu estado no arquivo `dynamic-security.json` e aplica
alterações enquanto o broker está em execução. Consulte a documentação oficial
do Mosquitto antes de alterar papéis ou ACLs.
