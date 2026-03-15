## 在浏览器中查看API文档

**直接访问**: `https://report-agent.gohire.top/gohire-data/docs`

此端点返回完整的API文档Markdown内容，可以直接在浏览器中查看，无需认证。

---

## 认证方式

本API使用JWT (JSON Web Token) 进行身份认证。所有API接口都需要在请求头中携带有效的JWT token。

 

### 获取面试记录列表

**请求方法**: `GET`  
**请求URL**: `/gohire/resources`  
**接口描述**: 根据分页参数和时间范围获取面试记录所有资源信息，支持按时间筛选和分页查询
**认证方式**: 需要在请求头中包含 `Authorization: Bearer <token>`

#### 请求头格式
```
Authorization: Bearer <your_jwt_token>
```

#### 请求参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `page` | integer | 否 | 1 | 页码，从1开始 |
| `size` | integer | 否 | 20 | 每页记录数量，最大值100 |
| `start_time` | string | 否 | - | 开始时间，ISO格式，如：`2024-01-01T00:00:00` |
| `end_time` | string | 否 | - | 结束时间，ISO格式，如：`2024-12-31T23:59:59` |

**分页说明**: 页码从1开始，第1页返回第1-20条记录，第2页返回第21-40条记录，以此类推。

#### 响应格式

```json
{
  "success": true,
  "data": [
    {
      "search_key": "查询key",
      "resume_url": "简历下载URL或null",
      "video_url": "视频URL或null"
    }
  ],
  "pagination": {
    "page": 1,
    "size": 20,
    "total": 150,
    "total_pages": 8,
    "has_more": true
  }
}
```

#### 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `success` | boolean | 请求是否成功 |
| `data` | array | 资源列表数组 |
| `data[].search_key` | string | 搜索 key |
| `data[].resume_url` | string/null | 简历下载URL，如果有简历则包含下载链接 |
| `data[].video_url` | string/null | 面试视频URL，如果有视频则包含访问链接
| `pagination` | object | 分页信息 |
| `pagination.page` | integer | 当前页码 |
| `pagination.size` | integer | 每页记录数量 |
| `pagination.total` | integer | 总记录数 |
| `pagination.total_pages` | integer | 总页数 |
| `pagination.has_more` | boolean | 是否还有更多数据 | 

#### 调用示例

```bash
# 获取第1页的20条记录（默认）
curl -X GET "https://report-agent.gohire.top/gohire-data/gohire/resources" \
  -H "Authorization: Bearer <your_jwt_token>"

# 指定分页参数（第3页，每页10条）
curl -X GET "https://report-agent.gohire.top/gohire-data/gohire/resources?page=3&size=10" \
  -H "Authorization: Bearer <your_jwt_token>"

# 按时间范围查询
curl -X GET "https://report-agent.gohire.top/gohire-data/gohire/resources?start_time=2024-01-01T00:00:00&end_time=2024-12-31T23:59:59" \
  -H "Authorization: Bearer <your_jwt_token>"

# 组合查询（第1页，每页5条，指定时间范围）
curl -X GET "https://report-agent.gohire.top/gohire-data/gohire/resources?page=1&size=5&start_time=2024-01-01T00:00:00" \
  -H "Authorization: Bearer <your_jwt_token>"
```

#### 错误响应

```json
{
  "detail": "错误描述信息"
}
```

**常见错误**:
- `500 Internal Server Error`: 数据库连接或其他服务器错误

---
### 下载内容文件

**请求方法**: `GET`  
**请求URL**: `/download/{content_type}/{search_key}`  
**接口描述**: 下载指定内容类型的文件 (MD或JSON格式)
**认证方式**: 需要在请求头中包含 `Authorization: Bearer <token>`

#### 请求头格式
```
Authorization: Bearer <your_jwt_token>
```

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `content_type` | string | 是 | 内容类型：<br/>• `dialog` - 下载对话记录MD文件<br/>• `transcript` - 报告源数据（json）<br/>• `jd_requirements` - 下载面试要求MD文件<br/>• `jd_info` - 下载职位信息MD文件 |
| `search_key` | string | 是 | search_key |

#### 响应格式

直接返回文件下载，Content-Type根据文件类型自动设置：
- MD文件: `text/markdown; charset=utf-8`
- JSON文件: `application/json; charset=utf-8`

#### 调用示例

```bash
# 下载对话记录MD文件
curl -X GET "https://report-agent.gohire.top/gohire-data/download/dialog/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -o dialog.md

# 下载转录JSON文件
curl -X GET "https://report-agent.gohire.top/gohire-data/download/transcript/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -o transcript.json

# 下载面试要求MD文件
curl -X GET "https://report-agent.gohire.top/gohire-data/download/jd_requirements/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -o interview_requirements.md

# 下载职位信息MD文件
curl -X GET "https://report-agent.gohire.top/gohire-data/download/jd_info/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -o jd_info.md
```

---
*最后更新时间: 2026年*