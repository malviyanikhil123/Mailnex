pipeline {
    agent any

    parameters {
        choice(
            name: 'SERVICE',
            choices: ['BACKEND', 'FRONTEND', 'BOTH'],
            description: 'Select which service to deploy'
        )
    }

    environment {
        IMAGE_API = "nikhilmalviya80/mailnex-api:latest"
        IMAGE_UI  = "nikhilmalviya80/mailnex-ui:latest"

        COMPOSE_FILE = "/home/nikhil_malviya/docker/Mailex/docker-compose.yml"
    }

    stages {

        stage('Checkout') {
            steps {
                deleteDir()
                checkout scm
            }
        }

        stage('Docker Login') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DOCKER_USERNAME',
                        passwordVariable: 'DOCKER_PASSWORD'
                    )
                ]) {
                    sh '''
                        echo "$DOCKER_PASSWORD" | docker login \
                            -u "$DOCKER_USERNAME" \
                            --password-stdin
                    '''
                }
            }
        }

        stage('Build & Push') {
            steps {
                script {

                    if (params.SERVICE == 'BACKEND' || params.SERVICE == 'BOTH') {
                        dir('backend') {
                            sh """
                                docker build -t ${IMAGE_API} .
                                docker push ${IMAGE_API}
                            """
                        }
                    }

                    if (params.SERVICE == 'FRONTEND' || params.SERVICE == 'BOTH') {
                        dir('frontend') {
                            sh """
                                docker build -t ${IMAGE_UI} .
                                docker push ${IMAGE_UI}
                            """
                        }
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                script {

                    if (params.SERVICE == 'BACKEND' || params.SERVICE == 'BOTH') {
                        sh """
                            docker compose -f ${COMPOSE_FILE} pull mailnex-api
                            docker compose -f ${COMPOSE_FILE} up -d --no-deps --force-recreate mailnex-api
                        """
                    }

                    if (params.SERVICE == 'FRONTEND' || params.SERVICE == 'BOTH') {
                        sh """
                            docker compose -f ${COMPOSE_FILE} pull mailnex-ui
                            docker compose -f ${COMPOSE_FILE} up -d --no-deps --force-recreate mailnex-ui
                        """
                    }
                }
            }
        }
    }

    post {
        success {
            echo "Mailnex Deployment Successful"
        }

        failure {
            echo "Mailnex Deployment Failed"
        }

        always {
            sh 'docker image prune -f || true'
        }
    }
}
