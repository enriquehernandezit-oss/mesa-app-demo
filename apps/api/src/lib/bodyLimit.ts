import { bodyLimit } from 'hono/body-limit'

// No request body over 1 MB. Every handler reads its JSON in full before validating it, and Bun's
// default allows 128 MB, so one member could post enormous bodies at any route. The largest real
// request is a contacts or Instagram match (a few hundred KB); photos never come through here, they
// go straight to R2 on a presigned URL.
export const MAX_BODY_BYTES = 1024 * 1024
export const requestBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.json({ error: 'payload_too_large' }, 413),
})
