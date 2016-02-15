from __future__ import absolute_import

import os

activate_this = "{}/venv/bin/activate_this.py".format(os.path.dirname(os.path.abspath(__file__)))
execfile(activate_this, dict(__file__=activate_this))

def application(environ, start_response):
    status = "200 OK"
    headers = [('Content-type', 'text/html')]
    output = "okee"

    try:
        from jinja2 import Environment, FileSystemLoader

        from phalaka import config

        template_dir = os.path.join(os.path.dirname(__file__), "templates")
        env = Environment(loader=FileSystemLoader(template_dir))
        template = env.get_template("homepage.html")

        output = template.render(ASANA_CLIENT_ID=config.ASANA_CLIENT_ID,
                                 ASANA_REDIRECT_URI=config.ASANA_REDIRECT_URI)
    except Exception, e:
        status = "500 System Error"
        output = "{}".format(e)

    start_response(status, headers)
    return ["{}".format(output)]

