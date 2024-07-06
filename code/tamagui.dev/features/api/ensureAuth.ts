import { setupCors } from './cors'
import { getSupabaseServerClient } from './getSupabaseServerClient'
import { redirect } from './redirect'

/**
 * makes a supabase instance for the current user and returns a 401 if there's no user
 */
export const ensureAuth = async ({
  req,
  shouldRedirect = false,
}: {
  req: Request
  shouldRedirect?: boolean
}) => {
  setupCors(req)

  const supabase = getSupabaseServerClient(req)

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    if (shouldRedirect) {
      throw redirect(
        `/login?${new URLSearchParams({
          redirect_to: req.url ?? '',
        }).toString()}`,
        303
      )
    }

    throw Response.json(
      {
        error: 'The user is not authenticated',
      },
      {
        status: 401,
        statusText: `Not authed ${!user ? 'no user' : ''}`,
      }
    )
  }

  const userPrivate = await supabase
    .from('users_private')
    .select('*')
    .eq('id', user.id)
    .single()

  console.info(
    `Authed user: ${userPrivate.data?.github_user_name} / ${user.user_metadata.user_name}`
  )

  if (!userPrivate.data?.email || !userPrivate.data.github_user_name) {
    const updateData = {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata.full_name,
      github_refresh_token: user.user_metadata.github_refresh_token,
      github_user_name: user.user_metadata.user_name,
    }

    console.info(`Inserting new`, updateData)

    // fill in info
    const result = await supabase
      .from('users_private')
      .upsert(updateData)
      .eq('id', user.id)

    if (result.error) {
      console.error(`Error updating user metadata`, result.error)
    }
  }

  return { supabase, user, session }
}
