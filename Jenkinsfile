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

                git(
                    branch: 'main',
                    credentialsId: 'github-creds',
                    url: 'https://github.com/malviyanikhil123/Mailnex.git'
                )
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

                        echo "========== Building Mailnex Backend =========="

                        dir('backend') {
                            sh """
                                docker build -t ${IMAGE_API} .
                                docker push ${IMAGE_API}
                            """
                        }
                    }

                    if (params.SERVICE == 'FRONTEND' || params.SERVICE == 'BOTH') {

                        echo "========== Building Mailnex Frontend =========="

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

                        echo "========== Deploying Mailnex Backend =========="

                        sh """
                            docker compose -f ${COMPOSE_FILE} pull mailnex-api
                            docker compose -f ${COMPOSE_FILE} up -d --no-deps --force-recreate mailnex-api
                        """
                    }

                    if (params.SERVICE == 'FRONTEND' || params.SERVICE == 'BOTH') {

                        echo "========== Deploying Mailnex Frontend =========="

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
            echo "========================================"
            echo "Mailnex Deployment Successful"
            echo "========================================"
        }

        failure {
            echo "========================================"
            echo "Mailnex Deployment Failed"
            echo "========================================"
        }

        always {
            sh 'docker image prune -f || true'
        }
    }
}
