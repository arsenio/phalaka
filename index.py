from __future__ import absolute_import

import os

from jinja2 import Environment, FileSystemLoader

def application(environ, start_response):
    status = "200 OK"
    headers = [('Content-type', 'text/html')]
    output = "okee"

    if __package__ is None:
        from os import sys, path
        sys.path.append(path.dirname(path.dirname(path.abspath(__file__))))

    try:
        template_dir = os.path.join(os.path.dirname(__file__), "templates")
        env = Environment(loader=FileSystemLoader(template_dir))
        template = env.get_template("homepage.html")

        from phalaka import config
        output = template.render(ASANA_CLIENT_ID=config.ASANA_CLIENT_ID,
                                 ASANA_REDIRECT_URI=config.ASANA_REDIRECT_URI)
    except Exception, e:
        status = "500 System Error"
        output = "{}".format(e)

    start_response(status, headers)
    return ["{}".format(output)]

