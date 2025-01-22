# Check if .env file exists
if [ -f .env ]; then
  # Load environment variables from .env file
  export $(cat .env | xargs)
else
  if [ -f .env.sample ]; then
    # Copy .env.sample to .env
    cp .env.sample .env
    echo ".env file was missing, copied .env.sample to .env. Please modify the new .env file with the required environment variables and rerun."
  else
    echo ".env file is missing and .env.sample file is not available. Please create a .env file with the required environment variables."
  fi
fi