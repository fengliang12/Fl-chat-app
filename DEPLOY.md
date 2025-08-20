# 将Chat-App部署到Cloudflare Pages

本文档提供了将Chat-App部署到Cloudflare Pages的详细步骤。

## 前提条件

1. 已有Cloudflare账户
2. 已安装Node.js和npm
3. 已安装Wrangler CLI (`npm install -g wrangler`)

## 部署步骤

### 1. 登录Cloudflare账户

```bash
wrangler login
```

### 2. 构建应用

```bash
npm run build
```

### 3. 部署到Cloudflare Pages

使用我们添加的部署脚本：

```bash
npm run deploy
```

或者手动部署：

```bash
wrangler pages deploy build
```

### 4. 配置自定义域名（可选）

1. 登录Cloudflare控制台
2. 进入Pages项目
3. 点击「自定义域」
4. 添加您的域名并按照指示完成DNS配置

## 环境变量配置

我们已经设置了以下环境变量：

- `REACT_APP_API_URL`: GraphQL API的URL
  - 生产环境: `https://chat-service.fengqilin5.workers.dev/api/graphql`
  - 开发环境: `http://127.0.0.1:8787/api/graphql`

如果需要在Cloudflare Pages中修改环境变量：

1. 登录Cloudflare控制台
2. 进入Pages项目
3. 点击「设置」>「环境变量」
4. 添加或修改环境变量

## 注意事项

1. 确保chat-service已经部署到Cloudflare Workers
2. 确保API URL配置正确
3. 如果遇到CORS问题，请检查chat-service的CORS配置

## 故障排除

### CORS错误

如果遇到CORS错误，请确保chat-service的CORS配置允许来自您的Pages域名的请求。

### API连接问题

如果无法连接到API，请检查：

1. API URL是否正确
2. chat-service是否正常运行
3. 网络连接是否正常

### 部署失败

如果部署失败，请检查：

1. Wrangler CLI是否正确安装
2. 是否已登录Cloudflare账户
3. 构建是否成功