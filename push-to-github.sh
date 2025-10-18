#!/bin/bash

# HELIX.ONE - GitHub Push Script
# This script helps you push your project to GitHub

echo "🚀 HELIX.ONE - GitHub Push Helper"
echo "=================================="
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "📦 Initializing git repository..."
    git init
    echo "✅ Git initialized!"
    echo ""
fi

# Check if sensitive files exist and warn
if [ -f "backend/.env" ]; then
    echo "⚠️  WARNING: .env file detected!"
    echo "   Make sure it's in .gitignore (already added)"
    echo ""
fi

if [ -f "cookies.txt" ] || [ -f "test-cookies.txt" ]; then
    echo "⚠️  WARNING: Cookie files detected!"
    echo "   Make sure they're in .gitignore (already added)"
    echo ""
fi

# Add all files
echo "📝 Adding files to git..."
git add .

# Show status
echo ""
echo "📊 Git status:"
git status
echo ""

# Prompt for commit message
read -p "Enter commit message (or press Enter for default): " commit_message

if [ -z "$commit_message" ]; then
    commit_message="Initial commit - HELIX.ONE AI Trading Arena"
fi

echo ""
echo "💾 Creating commit..."
git commit -m "$commit_message"

echo ""
echo "🌐 GitHub Setup Instructions:"
echo "=================================="
echo ""
echo "1. Go to: https://github.com/new"
echo ""
echo "2. Repository name: helix-one"
echo ""
echo "3. Description:"
echo "   🚀 AI-powered crypto trading arena where 6 cutting-edge language models"
echo "   compete in live futures trading. Real-time leaderboard, technical analysis,"
echo "   and Binance integration."
echo ""
echo "4. Set visibility:"
echo "   - Public (recommended for open source)"
echo "   - Private (if you want to keep it private)"
echo ""
echo "5. DO NOT initialize with README, .gitignore, or license"
echo "   (we already have these)"
echo ""
echo "6. After creating the repo, you'll see commands like:"
echo ""
echo "   git remote add origin https://github.com/YOUR_USERNAME/helix-one.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "=================================="
echo ""

read -p "Have you created the GitHub repo? (y/n): " repo_created

if [ "$repo_created" = "y" ] || [ "$repo_created" = "Y" ]; then
    echo ""
    read -p "Enter your GitHub username: " github_username
    
    if [ ! -z "$github_username" ]; then
        echo ""
        echo "🔗 Adding remote repository..."
        git remote add origin "https://github.com/$github_username/helix-one.git" 2>/dev/null || git remote set-url origin "https://github.com/$github_username/helix-one.git"
        
        echo ""
        echo "🌿 Setting main branch..."
        git branch -M main
        
        echo ""
        echo "📤 Pushing to GitHub..."
        git push -u origin main
        
        echo ""
        echo "✅ SUCCESS! Your project is now on GitHub!"
        echo ""
        echo "🔗 View it at: https://github.com/$github_username/helix-one"
        echo ""
        echo "📋 Recommended Topics (add on GitHub):"
        echo "   cryptocurrency, trading-bot, ai-trading, binance, futures-trading,"
        echo "   leaderboard, real-time, nextjs, nodejs, typescript, technical-analysis,"
        echo "   automated-trading"
        echo ""
    fi
else
    echo ""
    echo "📋 Manual push commands:"
    echo "========================"
    echo ""
    echo "After creating your GitHub repo, run:"
    echo ""
    echo "  git remote add origin https://github.com/YOUR_USERNAME/helix-one.git"
    echo "  git branch -M main"
    echo "  git push -u origin main"
    echo ""
fi

echo "🎉 All done! Happy trading! 🚀📈"

