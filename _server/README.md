# 大英造梦室 · 后端说明

零依赖的小后端，负责三件事：**注册（昵称全局唯一）**、**凭 ID 认领**、**单词本跨设备同步**。
数据就一个 JSON 文件，一个班 / 一门课完全够用。

---

## 一、两种访问路径（可以同时开）

```
                        ┌───────────────────────────────┐
   校园网里的学生 ───────▶│ http://<本机IP>:8787/          │
                        │                               │
   校外 / 手机流量 ──────▶│ https://xxx.trycloudflare.com │──▶ 同一个 index.html
                        └───────────────────────────────┘       同一份 db.json
```

两条路访问的是**同一个进程、同一个数据库**，学生用哪条都能看到自己的单词本。

### 路径 A：校园网（不装任何东西）

1. 双击 `启动后端.bat`
2. 黑窗口里会打印本机的局域网地址，例如
   `http://10.194.190.181:8787/    [WLAN]`
3. 把这个地址发给同一 WiFi / 校园网的同学即可
4. 第一次运行 Windows 会弹防火墙提示，选「允许」；没弹或选错了，用管理员执行：
   ```
   netsh advfirewall firewall add rule name="大英造梦室" dir=in action=allow protocol=TCP localport=8787
   ```

### 路径 B：公网（学生不在校园网、用手机流量）

需要先下载 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
（Windows 版，解压出 `cloudflared.exe`，放进本文件夹）。

然后双击 `启动公网隧道.bat`，它会：

1. 检查本地服务有没有在跑，没有就起一个
2. 开一条隧道，窗口里会打印类似 `https://random-words-here.trycloudflare.com`
3. 把这个 https 地址发给校外同学

> 这是 Cloudflare 的免费临时隧道：**地址每次重启都会变**，窗口关了隧道就断。
> 想要固定域名，得注册 Cloudflare 账号做 named tunnel，或者上云服务器（见文末）。

**两条路同时开完全没问题**：校园网同学用 IP，校外同学用隧道地址，数据互通。

---

## 二、跑起来

**前提**：装 Node.js（<https://nodejs.org/>，LTS 版）。装完 `node -v` 能看到版本号。

```bash
node _server/server.js            # 默认 8787
PORT=9000 node _server/server.js  # 换端口
```

或双击 `启动后端.bat`（起服务并打开浏览器）。

---

## 三、前端怎么判断

`index.html` 启动时探一下 `/api/ping`：

| 情况 | 行为 |
|---|---|
| 通过服务器地址打开（`http://…` / `https://…`） | **服务器模式**：昵称全局唯一、单词本在服务器、可用 ID 认领 |
| 双击 `index.html`（`file://`） | **本地模式**：还是 localStorage，能用但没有全局唯一，也没有认领入口 |
| 服务器挂了 | 自动退回本地模式，主页显示「本地模式」 |

主页那行小字会写「服务器同步中」还是「本地模式」。

---

## 四、凭 ID 认领

学生换电脑、换浏览器、清了缓存之后，用当初分配的 ID（形如 `ZJU-ABC12`）就能把账号和单词本拿回来：

登录页 →「换设备或清了缓存？用 ID 认领」→ 输入 ID → 认领。

- ID **不区分大小写**，输入 `jvmna` 会自动补成 `ZJU-JVMNA`
- 认领**不会让原来的设备掉线**（token 不变），手机 + 电脑可以同时用
- 代价：**ID 就是钥匙**，谁拿到都能进。页面上已提醒学生别外传
- 认领接口单独限流：同一 IP 每分钟最多 12 次，防瞎猜

---

## 五、接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ping` | 健康检查 |
| POST | `/api/register` | `{nick}` → `{id, nick, token}`；重名返回 **409** |
| POST | `/api/claim` | `{id}` → `{id, nick, token}`；无此 ID 返回 **404** |
| POST | `/api/login` | `{id, token}` → 用已保存的凭证换回账号 |
| GET | `/api/me` | 需 `Authorization: Bearer <token>` |
| GET | `/api/book` | 读单词本 |
| PUT | `/api/book` | `{items:[…]}` 覆盖写，最多 600 条 |

---

## 六、数据

- 位置：`_server/data/db.json`
- 结构：`{ "accounts": {id: {id, nick, key, token, t, claimed, lastClaim}}, "books": {id: [词…]} }`
- **备份**：复制这个文件
- **重置**：删掉它，下次启动自动重建空库

---

## 七、长期部署（不想每次开电脑）

内网穿透适合临时用；要稳定，选下面任一条：

**(a) 云服务器**（最稳，1 核 1G 足够）

```bash
npm i -g pm2
pm2 start _server/server.js --name ce-room
pm2 save && pm2 startup
```

前面挂 Nginx 反代到 8787，配好证书就是 `https://你的域名/`，学生直接访问域名。

**(b) 免费 PaaS**（Render / Railway / Fly.io）

启动命令 `node _server/server.js`，端口读 `PORT`。
⚠️ 这类平台文件系统是临时的，**重启会把 db.json 清空**，要持久化得挂磁盘或换 Postgres。

---

## 八、已知限制

1. **没有密码**，只有昵称 / ID + token。token 存在浏览器 localStorage 里，同机器换个人用能直接进。
2. 账号**没有找回兜底**：ID 丢了就真找不回来（库里还留着）。建议开学时让学生把自己的 ID 截图存好。
3. `db.json` 每次全量重写，几百个账号没问题，上千该换 SQLite。
4. 公网部署务必套 HTTPS（cloudflared / Nginx 都自带），否则 token 是明文传输。
