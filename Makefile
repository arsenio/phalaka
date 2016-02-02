.PHONY: clean-pyc clean-build docs cover

export SHELL := /bin/bash

PROJECT ?= phalaka
export PROJECT

# config locations
REQUIREMENTS := requirements.txt

# command aliases
VIRTUAL_ENV ?= $(WORKON_HOME)/$(PROJECT)
BIN := $(VIRTUAL_ENV)/bin
PIP := $(BIN)/pip
PYTHON := $(BIN)/python
WHEEL_DIR := $(HOME)/.pip/wheels/

# env setup related
PIP_INSTALL_ARGS = --pre
USE_WHEEL ?= 0
ifeq ($(USE_WHEEL),0)
PIP_INSTALL_ARGS += --process-dependency-links
endif

FORCE: venv

_mkvenv:
	@echo "Creating the $(PROJECT) virtual env ..."
	source /usr/local/bin/virtualenvwrapper.sh && \
	mkvirtualenv $(PROJECT)

_update_venv_tools:
	$(PIP) install -U pip wheel setuptools

venv:
	virtualenv venv
	venv/bin/pip install --upgrade pip wheel setuptools
	CFLAGS=-O0 venv/bin/pip install -r requirements.txt

update_tools:
	$(PIP) install --upgrade pip wheel setuptools

update_reqs:
	$(PIP) install -r requirements.txt

mkvenv:
	@echo "Checking if the $(PROJECT) virtualenv exists ..."
	test -d $(VIRTUAL_ENV) || $(MAKE) _mkvenv $(MAKE) _update_venv_tools

$(REQUIREMENTS): FORCE
	@echo "Installing $@ requirements file ..."
	$(PIP) install $(PIP_INSTALL_ARGS) -r $@

help:
	@echo "clean-build - remove build artifacts"
	@echo "clean-pyc - remove Python file artifacts"
	@echo "lint - check style with flake8"
	@echo "test - run tests quickly with the default Python"
	@echo "testall - run tests on every Python version with tox"
	@echo "coverage - check code coverage quickly with the default Python"
	@echo "docs - generate Sphinx HTML documentation, including API docs"
	@echo "release - package and upload a release"
	@echo "sdist - package"

clean: clean-build clean-pyc clean-pycache clean-test clean-vim

clean-build:
	-rm -fr build/
	-rm -fr dist/
	-rm -fr *.egg-info

clean-pyc:
	find . -name '*.pyc' -exec rm -f {} +
	find . -name '*.pyo' -exec rm -f {} +
	find . -name '*~' -exec rm -f {} +

clean-pycache:
	find . -iname "__pycache__" -exec rm -rf {} +

clean-test:
	-rm .coverage
	-rm nosetests.xml
	-rm -rf cover/

clean-vim:
	find . -name '*.swp' -exec rm -f {} +
	find . -name '*.swo' -exec rm -f {} +

print-%: ; @echo $*=$($*)
