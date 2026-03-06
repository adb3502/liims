library(shiny)
library(shinydashboard)
library(DT)
library(plotly)
library(dplyr)
library(ggplot2)
library(readr)
library(corrr)
library(VIM)
library(shinyWidgets)
library(purrr)
library(tidyr)
library(wesanderson)
library(shinycssloaders)

# Source UI and Server
source("ui.R")
source("server.R")

# PHASE 4: Enable bookmarking to save/share analysis states
enableBookmarking(store = "url")

# Launch the application
shinyApp(ui = ui, server = server)