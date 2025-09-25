# घे भरारी सेवा भावी संस्था - Backend API

Cloudflare Workers backend with KV storage for the Women Empowerment Website.

## Features

- Member registration with validation
- Member verification by mobile number
- Business directory with filtering
- Members list with pagination
- CORS enabled for frontend integration
- Data validation and error handling

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- Cloudflare account
- Wrangler CLI

### Installation

1. **Install Wrangler CLI globally:**
   \`\`\`bash
   npm install -g wrangler
   \`\`\`

2. **Navigate to backend directory:**
   \`\`\`bash
   cd backend
   \`\`\`

3. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

4. **Login to Cloudflare:**
   \`\`\`bash
   wrangler login
   \`\`\`

5. **Create KV namespaces:**
   \`\`\`bash
   # Create production KV namespaces
   wrangler kv:namespace create "MEMBERS_KV"
   wrangler kv:namespace create "BUSINESSES_KV"
   
   # Create preview KV namespaces for development
   wrangler kv:namespace create "MEMBERS_KV" --preview
   wrangler kv:namespace create "BUSINESSES_KV" --preview
   \`\`\`

6. **Update wrangler.toml:**
   - Replace the `id` and `preview_id` values in `wrangler.toml` with the IDs generated from step 5
   - Update `CORS_ORIGIN` to match your frontend URL

### Development

1. **Start development server:**
   \`\`\`bash
   npm run dev
   \`\`\`
   The API will be available at `http://localhost:8787`

2. **Test the API:**
   \`\`\`bash
   # Health check
   curl http://localhost:8787/api/health
   
   # Register a member
   curl -X POST http://localhost:8787/api/members/register \
     -H "Content-Type: application/json" \
     -d '{
       "fullName": "प्रिया शर्मा",
       "address": "123 मुख्य रस्ता, पुणे",
       "district": "पुणे",
       "mobile": "9876543210",
       "business": "ब्युटी पार्लर",
       "businessType": "ब्युटी पार्लर",
       "email": "priya@example.com"
     }'
   \`\`\`

### Deployment

1. **Deploy to Cloudflare:**
   \`\`\`bash
   npm run deploy
   \`\`\`

2. **View logs:**
   \`\`\`bash
   npm run tail
   \`\`\`

## API Endpoints

### POST /api/members/register
Register a new member.

**Request Body:**
\`\`\`json
{
  "fullName": "string (required)",
  "address": "string (required)",
  "district": "string (required)",
  "mobile": "string (required, 10 digits starting with 6-9)",
  "business": "string (required)",
  "businessType": "string (required)",
  "email": "string (optional)"
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "message": "Member registered successfully",
  "memberId": "string"
}
\`\`\`

### POST /api/members/verify
Verify if a mobile number is registered.

**Request Body:**
\`\`\`json
{
  "mobile": "string (required)"
}
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "verified": true,
  "member": {
    "fullName": "string",
    "district": "string",
    "business": "string",
    "businessType": "string",
    "registrationDate": "string"
  }
}
\`\`\`

### GET /api/businesses
Get business directory with optional filtering.

**Query Parameters:**
- `district` (optional): Filter by district
- `businessType` (optional): Filter by business type
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
\`\`\`json
{
  "success": true,
  "businesses": [
    {
      "id": "string",
      "name": "string",
      "type": "string",
      "owner": "string",
      "district": "string",
      "mobile": "string",
      "email": "string",
      "registrationDate": "string"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
\`\`\`

### GET /api/members
Get members list with optional filtering.

**Query Parameters:**
- `district` (optional): Filter by district
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**
\`\`\`json
{
  "success": true,
  "members": [
    {
      "id": "string",
      "fullName": "string",
      "district": "string",
      "business": "string",
      "businessType": "string",
      "registrationDate": "string"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 200,
    "totalPages": 10
  }
}
\`\`\`

### GET /api/health
Health check endpoint.

**Response:**
\`\`\`json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
\`\`\`

## Data Storage

The application uses Cloudflare KV for data storage:

### MEMBERS_KV
- `member:{id}` - Complete member data
- `mobile:{mobile}` - Mobile to member ID mapping

### BUSINESSES_KV
- `business:{id}` - Business data linked to member ID

## Environment Variables

Configure these in your Cloudflare Workers dashboard or wrangler.toml:

- `CORS_ORIGIN` - Frontend URL for CORS (default: http://localhost:5173)

## Security Features

- Input validation for all endpoints
- Mobile number uniqueness check
- CORS protection
- Error handling with appropriate HTTP status codes
- Data sanitization

## Monitoring

- Use `wrangler tail` to view real-time logs
- Monitor KV usage in Cloudflare dashboard
- Set up alerts for error rates and response times
# ghebharariFrontend
