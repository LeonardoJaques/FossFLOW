pipeline {
    agent any

    environment {
        VPS_HOST   = '172.19.0.1'
        VPS_USER   = 'leo'
        SSH_KEY    = '/var/jenkins_home/.ssh/id_rsa'
        SSH_OPTS   = '-o StrictHostKeyChecking=no -o BatchMode=yes'
        DOCKER_DIR = '/home/leo/docker'
        BUILD_DIR  = '/home/leo/docker/fossflow'
        APP_URL    = 'https://jaquesprojetos.com.br/fossflow'
    }

    stages {

        stage('Checkout') {
            steps {
                echo '📦 Checkout do código...'
                checkout scm
            }
        }

        stage('Testar Conexão VPS') {
            steps {
                echo '🔌 Testando conexão com VPS...'
                sh '''#!/bin/bash
                    ssh -i "${SSH_KEY}" ${SSH_OPTS} ${VPS_USER}@${VPS_HOST} \
                        "echo 'Conexão OK' && docker --version"
                '''
            }
        }

        stage('Atualizar Código no VPS') {
            steps {
                echo '📤 Atualizando código do FossFLOW no VPS via git...'
                sh '''#!/bin/bash
                    ssh -i "${SSH_KEY}" ${SSH_OPTS} ${VPS_USER}@${VPS_HOST} "
                        cd ${BUILD_DIR}
                        git fetch origin master
                        git reset --hard origin/master
                        echo '✅ Código atualizado!'
                    "
                '''
            }
        }

        stage('Build') {
            steps {
                echo '🔨 Buildando imagem do FossFLOW...'
                sh '''#!/bin/bash
                    ssh -i "${SSH_KEY}" ${SSH_OPTS} ${VPS_USER}@${VPS_HOST} "
                        cd ${DOCKER_DIR}
                        docker compose build fossflow
                        echo '✅ Build concluído!'
                    "
                '''
            }
        }

        stage('Deploy') {
            steps {
                echo '🚀 Subindo o container...'
                sh '''#!/bin/bash
                    ssh -i "${SSH_KEY}" ${SSH_OPTS} ${VPS_USER}@${VPS_HOST} "
                        cd ${DOCKER_DIR}
                        docker compose up -d fossflow
                        echo '✅ Container no ar!'
                        docker ps --filter name=fossflow --format 'table {{.Names}}\t{{.Status}}'
                    "
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo '🏥 Verificando saúde da aplicação...'
                sh '''#!/bin/bash
                    sleep 15

                    ssh -i "${SSH_KEY}" ${SSH_OPTS} ${VPS_USER}@${VPS_HOST} << 'ENDSSH'
                        echo "--- Logs fossflow ---"
                        docker logs fossflow --tail 15 2>&1

                        RUNNING=$(docker ps --filter name=fossflow --filter status=running -q)
                        [ -n "$RUNNING" ] && echo "✅ fossflow rodando" || { echo "❌ fossflow parado"; exit 1; }

                        STATUS=$(docker exec fossflow wget -qO- http://localhost:3001/api/storage/status 2>/dev/null)
                        echo "storage/status: $STATUS"
                        echo "$STATUS" | grep -q '"enabled":true' || { echo "❌ storage não habilitado"; exit 1; }
ENDSSH
                '''
            }
        }
    }

    post {
        success {
            echo "✅ Deploy concluído com sucesso!"
            echo "🌐 ${APP_URL}"
        }
        failure {
            echo '❌ Deploy falhou! Verifique os logs acima.'
        }
        always {
            echo '🏁 Pipeline finalizado.'
        }
    }
}
