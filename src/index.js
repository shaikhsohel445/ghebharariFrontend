// CORS headers for all responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

// Handle CORS preflight requests
function handleCORS(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }
}

// Generate unique ID for members
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Validate member data
function validateMemberData(data) {
  const errors = []

  if (!data.fullName?.trim()) errors.push("Full name is required")
  if (!data.address?.trim()) errors.push("Address is required")
  if (!data.district?.trim()) errors.push("District is required")
  if (!data.mobile?.trim()) errors.push("Mobile number is required")
  if (data.mobile && !/^[6-9]\d{9}$/.test(data.mobile)) {
    errors.push("Invalid mobile number format")
  }
  if (!data.business?.trim()) errors.push("Business/work is required")
  if (!data.businessType?.trim()) errors.push("Business type is required")
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push("Invalid email format")
  }

  return errors
}

import jwt from "@tsndr/cloudflare-worker-jwt"

// JWT secret - in production, use environment variable
const JWT_SECRET = "your-super-secret-jwt-key-change-in-production"

// Generate JWT token
async function generateToken(payload) {
  return await jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" })
}

// Verify JWT token
async function verifyToken(token) {
  try {
    return await jwt.verify(token, JWT_SECRET)
  } catch (error) {
    return false
  }
}

// Extract token from Authorization header
function extractToken(request) {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null
  }
  return authHeader.substring(7)
}

// Middleware to check authentication
async function requireAuth(request) {
  const token = extractToken(request)
  if (!token) {
    return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const isValid = await verifyToken(token)
  if (!isValid) {
    return new Response(JSON.stringify({ success: false, error: "Invalid or expired token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return null // No error, authentication successful
}

async function handleAdminLogin(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    const { username, password } = await request.json()

    // Simple admin credentials - in production, use hashed passwords
    if (username === "admin" && password === "admin123") {
      const token = await generateToken({
        username,
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      })

      return new Response(
        JSON.stringify({
          success: true,
          token,
          user: { username, role: "admin" },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    return new Response(JSON.stringify({ success: false, error: "Invalid credentials" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
}

async function handleMemberLogin(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    const { mobile, password } = await request.json()

    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return new Response(JSON.stringify({ success: false, error: "Valid mobile number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const memberId = await env.MEMBERS_KV.get(`mobile:${mobile}`)
    if (!memberId) {
      return new Response(JSON.stringify({ success: false, error: "Member not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const memberData = await env.MEMBERS_KV.get(`member:${memberId}`)
    const member = JSON.parse(memberData)

    // Simple password check - in production, use hashed passwords
    // For now, using last 4 digits of mobile as password
    const expectedPassword = mobile.slice(-4)
    if (password !== expectedPassword) {
      return new Response(JSON.stringify({ success: false, error: "Invalid password" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const token = await generateToken({
      memberId: member.id,
      mobile: member.mobile,
      role: "member",
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
    })

    return new Response(
      JSON.stringify({
        success: true,
        token,
        member: {
          id: member.id,
          fullName: member.fullName,
          mobile: member.mobile,
          district: member.district,
          business: member.business,
          businessType: member.businessType,
          registrationDate: member.registrationDate,
          status: member.status,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
}

// API Routes
async function handleMemberRegistration(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    const memberData = await request.json()

    // Validate data
    const errors = validateMemberData(memberData)
    if (errors.length > 0) {
      return new Response(JSON.stringify({ success: false, errors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check if mobile number already exists
    const existingMember = await env.MEMBERS_KV.get(`mobile:${memberData.mobile}`)
    if (existingMember) {
      return new Response(
        JSON.stringify({
          success: false,
          errors: ["Mobile number already registered"],
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Generate member ID and add metadata
    const memberId = generateId()
    const member = {
      ...memberData,
      id: memberId,
      registrationDate: new Date().toISOString(),
      status: "pending", // Changed from "active" to "pending" for admin approval
      verified: false,
      approved: false, // Added approval status
      approvedBy: null,
      approvedDate: null,
    }

    // Store member data
    await env.MEMBERS_KV.put(`member:${memberId}`, JSON.stringify(member))
    await env.MEMBERS_KV.put(`mobile:${memberData.mobile}`, memberId)

    // Store business data if provided
    if (memberData.business && memberData.businessType) {
      const businessData = {
        id: memberId,
        name: memberData.business,
        type: memberData.businessType,
        owner: memberData.fullName,
        district: memberData.district,
        mobile: memberData.mobile,
        email: memberData.email || "",
        registrationDate: new Date().toISOString(),
      }

      await env.BUSINESSES_KV.put(`business:${memberId}`, JSON.stringify(businessData))
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Member registered successfully",
        memberId,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        errors: ["Internal server error"],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
}

async function handleMemberVerification(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    const { mobile } = await request.json()

    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return new Response(
        JSON.stringify({
          success: false,
          errors: ["Valid mobile number is required"],
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const memberId = await env.MEMBERS_KV.get(`mobile:${mobile}`)

    if (!memberId) {
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          message: "Mobile number not found in our records",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const memberData = await env.MEMBERS_KV.get(`member:${memberId}`)
    const member = JSON.parse(memberData)

    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        member: {
          fullName: member.fullName,
          district: member.district,
          business: member.business,
          businessType: member.businessType,
          registrationDate: member.registrationDate,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        errors: ["Internal server error"],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
}

async function handleBusinessDirectory(request, env) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    const url = new URL(request.url)
    const district = url.searchParams.get("district")
    const businessType = url.searchParams.get("businessType")
    const page = Number.parseInt(url.searchParams.get("page") || "1")
    const limit = Number.parseInt(url.searchParams.get("limit") || "10")

    // Get all business keys
    const businessKeys = await env.BUSINESSES_KV.list({ prefix: "business:" })
    const businesses = []

    // Fetch all businesses
    for (const key of businessKeys.keys) {
      const businessData = await env.BUSINESSES_KV.get(key.name)
      if (businessData) {
        const business = JSON.parse(businessData)

        // Apply filters
        if (district && business.district !== district) continue
        if (businessType && business.type !== businessType) continue

        businesses.push(business)
      }
    }

    // Sort by registration date (newest first)
    businesses.sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))

    // Pagination
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedBusinesses = businesses.slice(startIndex, endIndex)

    return new Response(
      JSON.stringify({
        success: true,
        businesses: paginatedBusinesses,
        pagination: {
          page,
          limit,
          total: businesses.length,
          totalPages: Math.ceil(businesses.length / limit),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        errors: ["Internal server error"],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
}

async function handleMembersList(request, env) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    const url = new URL(request.url)
    const district = url.searchParams.get("district")
    const page = Number.parseInt(url.searchParams.get("page") || "1")
    const limit = Number.parseInt(url.searchParams.get("limit") || "20")

    // Get all member keys
    const memberKeys = await env.MEMBERS_KV.list({ prefix: "member:" })
    const members = []

    // Fetch all members
    for (const key of memberKeys.keys) {
      const memberData = await env.MEMBERS_KV.get(key.name)
      if (memberData) {
        const member = JSON.parse(memberData)

        // Apply district filter
        if (district && member.district !== district) continue

        // Return only public information
        members.push({
          id: member.id,
          fullName: member.fullName,
          district: member.district,
          business: member.business,
          businessType: member.businessType,
          registrationDate: member.registrationDate,
        })
      }
    }

    // Sort by registration date (newest first)
    members.sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))

    // Pagination
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedMembers = members.slice(startIndex, endIndex)

    return new Response(
      JSON.stringify({
        success: true,
        members: paginatedMembers,
        pagination: {
          page,
          limit,
          total: members.length,
          totalPages: Math.ceil(members.length / limit),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        errors: ["Internal server error"],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
}

async function handleAdminMembers(request, env) {
  const authError = await requireAuth(request)
  if (authError) return authError

  if (request.method === "GET") {
    try {
      const url = new URL(request.url)
      const status = url.searchParams.get("status") || "all"
      const page = Number.parseInt(url.searchParams.get("page") || "1")
      const limit = Number.parseInt(url.searchParams.get("limit") || "20")

      const memberKeys = await env.MEMBERS_KV.list({ prefix: "member:" })
      const members = []

      for (const key of memberKeys.keys) {
        const memberData = await env.MEMBERS_KV.get(key.name)
        if (memberData) {
          const member = JSON.parse(memberData)

          // Filter by status
          if (status !== "all" && member.status !== status) continue

          members.push(member)
        }
      }

      // Sort by registration date (newest first)
      members.sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))

      // Pagination
      const startIndex = (page - 1) * limit
      const endIndex = startIndex + limit
      const paginatedMembers = members.slice(startIndex, endIndex)

      return new Response(
        JSON.stringify({
          success: true,
          members: paginatedMembers,
          pagination: {
            page,
            limit,
            total: members.length,
            totalPages: Math.ceil(members.length / limit),
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders })
}

async function handleMemberApproval(request, env) {
  const authError = await requireAuth(request)
  if (authError) return authError

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    console.log("[v0] Processing member approval")
    const { memberId, action, reason } = await request.json()

    if (!memberId || !["approve", "reject"].includes(action)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid request data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const memberData = await env.MEMBERS_KV.get(`member:${memberId}`)
    if (!memberData) {
      return new Response(JSON.stringify({ success: false, error: "Member not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const member = JSON.parse(memberData)
    member.status = action === "approve" ? "active" : "rejected"
    member.approved = action === "approve"
    member.approvedBy = "admin"
    member.approvedDate = new Date().toISOString()
    if (reason) member.rejectionReason = reason

    console.log("[v0] Updating member status:", memberId, action)
    await env.MEMBERS_KV.put(`member:${memberId}`, JSON.stringify(member))

    return new Response(
      JSON.stringify({
        success: true,
        message: `Member ${action}d successfully`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    console.error("[v0] Error in member approval:", error)
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
}

async function handleAdminStats(request, env) {
  const authError = await requireAuth(request)
  if (authError) return authError

  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    console.log("[v0] Fetching admin stats")

    // Get all member keys
    const memberKeys = await env.MEMBERS_KV.list({ prefix: "member:" })
    const members = []

    for (const key of memberKeys.keys) {
      const memberData = await env.MEMBERS_KV.get(key.name)
      if (memberData) {
        members.push(JSON.parse(memberData))
      }
    }

    // Get all video keys
    const videoKeys = await env.VIDEOS_KV.list({ prefix: "video:" })
    const videos = []

    for (const key of videoKeys.keys) {
      const videoData = await env.VIDEOS_KV.get(key.name)
      if (videoData) {
        videos.push(JSON.parse(videoData))
      }
    }

    const stats = {
      totalMembers: members.length,
      pendingMembers: members.filter((m) => m.status === "pending").length,
      approvedMembers: members.filter((m) => m.status === "active").length,
      rejectedMembers: members.filter((m) => m.status === "rejected").length,
      totalVideos: videos.length,
    }

    console.log("[v0] Admin stats:", stats)

    return new Response(JSON.stringify({ success: true, stats }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[v0] Error fetching admin stats:", error)
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
}

async function handleVideos(request, env) {
  if (request.method === "GET") {
    try {
      console.log("[v0] Fetching videos")
      const videoKeys = await env.VIDEOS_KV.list({ prefix: "video:" })
      const videos = []

      for (const key of videoKeys.keys) {
        const videoData = await env.VIDEOS_KV.get(key.name)
        if (videoData) {
          videos.push(JSON.parse(videoData))
        }
      }

      // Sort by creation date (newest first)
      videos.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))

      console.log("[v0] Found videos:", videos.length)
      return new Response(JSON.stringify({ success: true, videos }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    } catch (error) {
      console.error("[v0] Error fetching videos:", error)
      return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  if (request.method === "POST") {
    const authError = await requireAuth(request)
    if (authError) return authError

    try {
      console.log("[v0] Adding new video")
      const { title, description, youtubeUrl } = await request.json()

      if (!title || !youtubeUrl) {
        return new Response(JSON.stringify({ success: false, error: "Title and YouTube URL are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Extract YouTube video ID
      const videoId = extractYouTubeId(youtubeUrl)
      if (!videoId) {
        return new Response(JSON.stringify({ success: false, error: "Invalid YouTube URL" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const video = {
        id: generateId(),
        title,
        description: description || "",
        youtubeUrl,
        videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        createdDate: new Date().toISOString(),
        createdBy: "admin",
      }

      console.log("[v0] Saving video:", video.id)
      await env.VIDEOS_KV.put(`video:${video.id}`, JSON.stringify(video))

      return new Response(JSON.stringify({ success: true, video }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    } catch (error) {
      console.error("[v0] Error adding video:", error)
      return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders })
}

// Helper function to extract YouTube video ID
function extractYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  const match = url.match(regex)
  return match ? match[1] : null
}

// Main request handler
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    const corsResponse = handleCORS(request)
    if (corsResponse) return corsResponse

    const url = new URL(request.url)
    const path = url.pathname

    console.log("[v0] Request:", request.method, path)

    if (path === "/api/auth/admin/login") {
      return handleAdminLogin(request, env)
    }

    if (path === "/api/auth/member/login") {
      return handleMemberLogin(request, env)
    }

    if (path === "/api/admin/stats") {
      return handleAdminStats(request, env)
    }

    if (path === "/api/admin/members") {
      return handleAdminMembers(request, env)
    }

    if (path === "/api/admin/members/approve") {
      return handleMemberApproval(request, env)
    }

    if (path === "/api/videos") {
      return handleVideos(request, env)
    }

    // API Routes
    if (path === "/api/members/register") {
      return handleMemberRegistration(request, env)
    }

    if (path === "/api/members/verify") {
      return handleMemberVerification(request, env)
    }

    if (path === "/api/businesses") {
      return handleBusinessDirectory(request, env)
    }

    if (path === "/api/members") {
      return handleMembersList(request, env)
    }

    // Health check
    if (path === "/api/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // 404 for unknown routes
    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders,
    })
  },
}
