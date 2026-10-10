import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

Deno.serve(async (req) => {

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabaseAdmin
      .from('t_Users')
      .select('Login, IdContact')
      .eq('Actif', true)
      .order('Login')

    if (error) {
      return Response.json(
        { error: error.message },
        {
          status: 400,
          headers: corsHeaders
        }
      )
    }

    const idsContacts = [...new Set(data.map(user => user.IdContact))]

    const { data: contacts, error: erreurContacts } = await supabaseAdmin
      .from('t_Contacts')
      .select('IdContact, NomUsage, NomdeNaissance, Prenom')
      .in('IdContact', idsContacts)

    if (erreurContacts) {
      return Response.json(
        { error: erreurContacts.message },
        {
          status: 400,
          headers: corsHeaders
        }
      )
    }

    const contactsParId = new Map((contacts ?? []).map(contact => [contact.IdContact, contact]))

    const utilisateurs = data.map(user => {
      const contact = contactsParId.get(user.IdContact)
      const nom = (contact?.NomUsage || contact?.NomdeNaissance || '').toUpperCase()
      const nomComplet = `${nom} ${contact?.Prenom ?? ''}`.trim()

      return {
        login: user.Login,
        nomComplet: nomComplet || user.Login
      }
    })

    return Response.json(
      {
        logins: data.map(user => user.Login),
        utilisateurs
      },
      {
        headers: corsHeaders
      }
    )

  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      {
        status: 500,
        headers: corsHeaders
      }
    )
  }
})
