FROM cimg/node:18.15
USER root
RUN usermod -u 3434 circleci; groupmod -g 3434 circleci;
USER circleci

ARG LAST_BUILD_DATE
ENV LAST_BUILD_DATE $LAST_BUILD_DATE

# Install a few essentials
RUN sudo apt-get update && sudo apt-get install -y git python-is-python3 python3-pip build-essential libsasl2-dev liblz4-dev openssl libc6

# Install AWS CLI
RUN sudo pip install --upgrade pip && sudo pip install awscli

RUN node -v && npm -v

