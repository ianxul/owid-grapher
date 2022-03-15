import * as express from "express"
import * as crypto from "crypto"
import * as randomstring from "randomstring"
import { User } from "../db/model/User.js"
import * as db from "../db/db.js"
import {
    CLOUDFLARE_AUD,
    SECRET_KEY,
    SESSION_COOKIE_AGE,
} from "../settings/serverSettings.js"
import { BCryptHasher } from "../db/hashers.js"
import fetch from "node-fetch"
import jwt, { Secret } from "jsonwebtoken"
import { ADMIN_BASE_URL, ENV } from "../settings/serverSettings.js"
import { JsonError } from "../clientUtils/owidTypes.js"

export type CurrentUser = User

export type Request = express.Request

export interface Response extends express.Response {
    locals: { user: CurrentUser; session: Session }
}

interface Session {
    id: string
    expiryDate: Date
}

const CLOUDFLARE_COOKIE_NAME = "CF_Authorization"

/*
 * See authentication.php for detailed descriptions.
 */
export async function authCloudflareSSOMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    const jwt = req.cookies[CLOUDFLARE_COOKIE_NAME]
    if (!jwt) return next()

    const audTag = CLOUDFLARE_AUD
    if (!audTag) {
        console.error(
            "Missing or empty audience tag. Please add CLOUDFLARE_AUD key in settings."
        )
        return next()
    }

    // Get the Cloudflare public key
    const certsUrl = "https://owid.cloudflareaccess.com/cdn-cgi/access/certs"
    const response = await fetch(certsUrl)
    const certs = await response.json()
    const publicCerts = certs.public_certs
    if (!publicCerts) {
        console.error("Missing public certificates from Cloudflare.")
        return next()
    }
    // Verify the JWT token
    let certVerificationErr
    let payload: any
    const verified = publicCerts.some((certObj: { cert: Secret }) => {
        try {
            payload = jwt.verify(jwt, certObj.cert, {
                audience: audTag,
                algorithms: ["RS256"],
            })
            return true
        } catch (err) {
            certVerificationErr = err
        }
        return false
    })

    if (!verified) {
        // Authorization token invalid: verification failed, token expired or wrong audience.
        console.error(certVerificationErr)
        return next()
    }

    if (!payload.email) {
        console.error("Missing email in JWT claims.")
        return next()
    }

    const user = await User.findOne({ email: payload.email })
    if (!user) return next("User not found. Please contact an administrator.")

    // Authenticate as the user stored in the token
    const { id: sessionId } = await logInAsUser(user)
    res.cookie("sessionid", sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: ENV === "production",
    })

    // Prevents redirect to external URLs
    let redirectTo = "/admin"
    if (req.query.next) {
        try {
            redirectTo = new URL(req.query.next as string, ADMIN_BASE_URL)
                .pathname
        } catch (err) {
            console.error(err)
        }
    }
    return res.redirect(redirectTo)
}

export async function logOut(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    if (res.locals.user)
        await db.queryMysql(`DELETE FROM sessions WHERE session_key = ?`, [
            res.locals.session.id,
        ])

    res.clearCookie("sessionid")
    res.clearCookie(CLOUDFLARE_COOKIE_NAME)
    return res.redirect("/admin")
}

export async function authMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    let user: CurrentUser | undefined
    let session: Session | undefined

    const sessionid = req.cookies["sessionid"]
    if (sessionid) {
        // Expire old sessions
        await db.execute("DELETE FROM sessions WHERE expire_date < NOW()")

        const rows = await db.queryMysql(
            `SELECT * FROM sessions WHERE session_key = ?`,
            [sessionid]
        )
        if (rows.length) {
            const sessionData = Buffer.from(
                rows[0].session_data,
                "base64"
            ).toString("utf8")
            const sessionJson = JSON.parse(
                sessionData.split(":").slice(1).join(":")
            )

            user = await User.findOne({ email: sessionJson.user_email })
            if (!user)
                throw new JsonError("Invalid session (no such user)", 500)
            session = { id: sessionid, expiryDate: rows[0].expiry_date }

            // Don't await this
            user.lastSeen = new Date()
            user.save()
        }
    }

    // Authed urls shouldn't be cached
    res.set("Cache-Control", "public, max-age=0, must-revalidate")

    if (user && user.isActive) {
        res.locals.session = session
        res.locals.user = user
        return next()
    } else if (
        !req.path.startsWith("/admin") ||
        req.path === "/admin/login" ||
        req.path === "/admin/register"
    )
        return next()

    return res.redirect(`/admin/login?next=${encodeURIComponent(req.url)}`)
}

function saltedHmac(salt: string, value: string): string {
    const hmac = crypto.createHmac("sha1", salt + SECRET_KEY)
    hmac.update(value)
    return hmac.digest("hex")
}

async function logInAsUser(user: User) {
    const sessionId = randomstring.generate()

    const sessionJson = JSON.stringify({
        user_email: user.email,
    })
    const sessionHash = saltedHmac(
        "django.contrib.sessions.SessionStore",
        sessionJson
    )
    const sessionData = Buffer.from(`${sessionHash}:${sessionJson}`).toString(
        "base64"
    )

    const now = new Date()
    const expiryDate = new Date(now.getTime() + 1000 * SESSION_COOKIE_AGE)

    await db.execute(
        `INSERT INTO sessions (session_key, session_data, expire_date) VALUES (?, ?, ?)`,
        [sessionId, sessionData, expiryDate]
    )

    user.lastLogin = now
    await user.save()

    return { id: sessionId, expiryDate: expiryDate }
}

export async function logInWithCredentials(
    email: string,
    password: string
): Promise<Session> {
    const user = await User.findOne({ email: email })
    if (!user) throw new Error("No such user")

    const hasher = new BCryptHasher()
    if (await hasher.verify(password, user.password))
        // Login successful
        return logInAsUser(user)

    throw new Error("Invalid password")
}
