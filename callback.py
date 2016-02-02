import requests

from cgi import parse_qs

import Cookie
import datetime

ASANA_CLIENT_ID = "85566523072252"
ASANA_CLIENT_SECRET = "3a6f0ac79679d87b3e51c9ae5f2da4e3"
ASANA_REDIRECT_URI = "http://phalaka.local/callback"

def application(environ, start_response):
    qs = parse_qs(environ["QUERY_STRING"])
    state = qs.get("state")
    if isinstance(state, list):
        state = state[0]

    code = qs.get("code")
    refresh = qs.get("refresh")

    output = ""

    headers = []

    payload = {
        "client_id": ASANA_CLIENT_ID,
        "client_secret": ASANA_CLIENT_SECRET,
        "redirect_uri": ASANA_REDIRECT_URI,
    }

    payloaded = False

    if code:
        payload["grant_type"] = "authorization_code"
        payload["code"] = code
        payloaded = True
    elif refresh:
        payload["grant_type"] = "refresh_token"
        payload["refresh_token"] = refresh
        payloaded = True

    if payloaded:
        status = "200 OK"

        try:
            res = requests.post("https://app.asana.com/-/oauth_token",
                                data=payload)
            asana = res.json()
            access_token = asana.get("access_token")
            refresh_token = asana.get("refresh_token")

            username = ""
            asana_auth_data = asana.get("data")
            if asana_auth_data:
                username = asana_auth_data.get("name")

            if access_token:
                headers.append(('Set-Cookie',
                                cookie_output("access", access_token)))
                headers.append(('Set-Cookie',
                                cookie_output("username", username)))

                if refresh_token:
                    headers.append(('Set-Cookie',
                                    cookie_output("refresh", refresh_token)))

                if code:
                    status = "307 Moved Temporarily"
                    redirect_url = "/"
                    if state:
                        redirect_url += "#" + state
                    headers.append(("Location", redirect_url))

            output = res.text
        except Exception, e:
            output = "{}".format(e)

    headers.append(('Content-type', 'text/html'))

    start_response(status, headers)
    return ["{}".format(output)]

def cookie_output(name, value):
    cookie = Cookie.BaseCookie()
    expiry = datetime.datetime.now() + datetime.timedelta(days=30)
    cookie[name] = value
    cookie[name]["path"] = "/"
    cookie[name]["expires"] = expiry.strftime("%a, %d-%b-%Y %H:%M:%S PST")
    return cookie[name].OutputString()
