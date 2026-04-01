# 支付宝支付创建接口

## 接口地址

```
POST https://worker.gohire.top/payment/payment/create
```

## 请求头

| Header       | 值               |
| ------------ | ---------------- |
| Content-Type | application/json |

## 请求参数

| 字段                       | 类型   | 必填 | 说明                       |
| -------------------------- | ------ | ---- | -------------------------- |
| out_trade_no               | string | 是   | 业务订单号，唯一标识       |
| total_amount               | number | 是   | 支付金额                   |
| subject                    | string | 是   | 订单标题/商品名称          |
| pay_channel                | string | 是   | 固定值 `alipay`            |
| user_name                  | string | 是   | 用户名                     |
| user_email                 | string | 是   | 用户邮箱                   |
| user_id                    | string | 是   | 用户ID                     |
| platform                   | string | 是   | 固定值 `gohire`            |
| package_data               | object | 否   | 套餐内容，仅作记录         |
| package_data.package_id    | string | 否   | 套餐ID                     |
| package_data.package_name  | string | 否   | 套餐名称                   |
| package_data.package_type  | string | 否   | 套餐类型                   |
| package_data.package_price | string | 否   | 套餐价格                   |
| package_data.package_info  | string | 否   | 套餐详情(JSON字符串)       |
| notify_url                 | string | 是   | 支付成功服务端回调地址     |
| return_url                 | string | 否   | 支付成功后跳转前端页面地址 |

## 请求示例

```bash
curl --location --request POST 'https://worker.gohire.top/payment/payment/create' \
--header 'Content-Type: application/json' \
--data-raw '{
    "out_trade_no": "ORDER_20251226200555_bd2dec8f-4ed9-4ca9-8f47-3873b527b86a",
    "total_amount": 19.9,
    "subject": "套餐名称",
    "pay_channel": "alipay",
    "user_name": "chenzd",
    "user_email": "zhendongchen@lightark.ai",
    "user_id": "bd2dec8f-4ed9-4ca9-8f47-3873b527b86a",
    "platform": "gohire",
    "package_data": {
        "package_id": "80d27b28-b86b-498a-9556-baacffac3a87",
        "package_name": "month_19.9",
        "package_type": "1",
        "package_price": "19.90",
        "package_info": "{\"number\": 90, \"description\": \"当月有效\", \"msg\": \"10次模拟面试\", \"times\": 10, \"type\": \"simulate\"}"
    },
    "notify_url": "https://xxxxxxx/payment/callback",
    "return_url": "https://xxxxx/xxxx/payment/return"
}'
```

## 响应参数

| 字段              | 类型   | 说明                  |
| ----------------- | ------ | --------------------- |
| code              | number | 0 表示成功            |
| data              | object | 响应数据              |
| data.pay_url      | string | 支付宝支付页面URL     |
| data.trade_status | string | 交易状态              |
| message           | string | 错误信息，成功为 null |

## 响应示例

```json
{
  "code": 0,
  "data": {
    "pay_url": "https://openapi.alipay.com/gateway.do?app_id=2021005132619842&...",
    "trade_status": "WAIT_BUYER_PAY"
  },
  "message": null
}
```

## 交易状态

| 状态           | 说明         |
| -------------- | ------------ |
| WAIT_BUYER_PAY | 等待买家付款 |
| TRADE_SUCCESS  | 交易成功     |
| TRADE_CLOSED   | 交易关闭     |

## 支付结果回调（Callback）

> 用于接收支付服务通知并更新本地订单状态。

### 回调地址(notify_url 填入 的地址)

示例：

```text
http://gohire.top/api/v1/payment/callback?pay_status=TRADE_SUCCESS&out_trade_no=TOPUP_1772538352580_cmlarlwa
```

### 回调参数

| 参数         | 类型   | 必填 | 说明                                          |
| ------------ | ------ | ---- | --------------------------------------------- |
| pay_status   | string | 是   | 支付状态，见下方状态说明                      |
| out_trade_no | string | 是   | 业务订单号（创建支付时传入的 `out_trade_no`） |

### pay_status 状态说明

| 状态           | 说明              | 建议处理                   |
| -------------- | ----------------- | -------------------------- |
| TRADE_SUCCESS  | 支付成功          | 将订单置为已支付并发放权益 |
| WAIT_BUYER_PAY | 待支付            | 保持订单待支付状态         |
| TRADE_CLOSED   | 交易关闭/超时关闭 | 将订单置为关闭或失败       |

### 回调处理建议

1. 先校验 `out_trade_no` 是否存在且匹配本地订单。
2. 仅在当前订单未支付时处理 `TRADE_SUCCESS`，避免重复发放（幂等）。
3. 记录完整回调日志（含请求参数、处理结果、时间）。
4. 建议增加来源校验/签名校验，防止伪造回调。

### 返回约定（建议）

回调处理成功后返回 HTTP 200，示例：

```json
{
  "code": 0,
  "message": "success"
}
```

回调参数异常或订单不存在时，返回 4xx，示例：

```json
{
  "code": 40001,
  "message": "invalid callback params"
}
```
